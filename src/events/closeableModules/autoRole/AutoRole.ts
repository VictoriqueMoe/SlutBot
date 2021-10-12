import {CloseableModule} from "../../../model/closeableModules/impl/CloseableModule";
import {ArgsOf, Client, Discord, On} from "discordx";
import {CloseOptionModel} from "../../../model/DB/autoMod/impl/CloseOption.model";
import * as schedule from "node-schedule";
import {GuildMember} from "discord.js";
import {RolePersistenceModel} from "../../../model/DB/autoMod/impl/RolePersistence.model";
import {DiscordUtils, GuildUtils, ObjectUtil, TimeUtils} from "../../../utils/Utils";
import {GuildManager} from "../../../model/guild/manager/GuildManager";
import {UniqueViolationError} from "../../../DAO/BaseDAO";
import {BannedWordFilter} from "../../../model/closeableModules/subModules/dynoAutoMod/impl/BannedWordFilter";
import {AutoRoleSettings} from "../../../model/closeableModules/AutoRoleSettings";
import {TimedSet} from "../../../model/Impl/TimedSet";
import {container, injectable} from "tsyringe";
import {RoleApplier} from "../../customAutoMod/RoleApplier/RoleApplier";
import TIME_UNIT = TimeUtils.TIME_UNIT;

class JoinEntry {
    constructor(public joinCount: number) {
    }

    public increment(): void {
        this.joinCount++;
    }
}

@Discord()
@injectable()
export class AutoRole extends CloseableModule<AutoRoleSettings> {

    private static joinTimedSet = new TimedSet<JoinEntry>(10000);

    constructor(private _roleApplier: RoleApplier) {
        super(CloseOptionModel);
    }

    public get moduleId(): string {
        return "AutoRole";
    }

    public get isDynoReplacement(): boolean {
        return true;
    }

    public async applyRole(member: GuildMember, guildId: string, isTimed: boolean = false): Promise<void> {
        if (member.deleted) {
            return;
        }
        const settings = await this.getSettings(guildId, isTimed);
        if (await this.doPanic(member, settings)) {
            return;
        }
        const filter: BannedWordFilter = container.resolve(BannedWordFilter);
        if (filter.isActive && await filter.checkUsername(member)) {
            return;
        }
        const autoRole = await GuildUtils.RoleUtils.getAutoRole(guildId);
        const persistedRole = await RolePersistenceModel.findOne({
            where: {
                userId: member.id,
                guildId
            }
        });
        const guildManager = container.resolve(GuildManager);
        const guild = await guildManager.getGuild(guildId);
        const bot = guild.me;
        const botUsername = bot.user.username;
        try {
            if (persistedRole) {
                const rolePersisted = await guild.roles.fetch(persistedRole.roleId);
                const jailRole = await GuildUtils.RoleUtils.getJailRole(guildId);
                const muteRole = await GuildUtils.RoleUtils.getMuteRole(guildId);
                if (jailRole && rolePersisted.id === jailRole.id) {
                    if (settings.autoJail) {
                        DiscordUtils.postToLog(`Member <@${member.user.id}> has rejoined after leaving in jail and has be re-jailed`, member.guild.id);
                        await this._roleApplier.applyRole(rolePersisted, member, `added via ${botUsername}`);
                    }
                } else if (muteRole && rolePersisted.id === muteRole.id) {
                    if (settings.autoMute) {
                        DiscordUtils.postToLog(`Member <@${member.user.id}> has rejoined after leaving as muted and has been re-muted.`, member.guild.id);
                        await this._roleApplier.applyRole(rolePersisted, member, `added via ${botUsername}`);
                    }
                } else {
                    await this._roleApplier.applyRole(rolePersisted, member, `added via ${botUsername}`);
                }
                return;
            }
        } catch {
        }
        if (autoRole) {
            try {
                await this._roleApplier.applyRole(autoRole, member, `added via ${botUsername}`);
            } catch {
            }
        }
    }

    private async doPanic(member: GuildMember, settings: AutoRoleSettings): Promise<boolean> {
        if (settings.panicMode) {
            try {
                await GuildUtils.applyPanicModeRole(member);
                return true;
            } catch {
            }
            return false;
        }
    }

    @On("guildMemberAdd")
    private async memberJoins([member]: ArgsOf<"guildMemberAdd">, client: Client): Promise<void> {
        const guildId = member.guild.id;
        if (!await this.canRun(guildId, null, null)) {
            return;
        }
        const settings = await this.getSettings(guildId);
        if (settings.massJoinProtection > 0 && !settings.panicMode) {
            if (AutoRole.joinTimedSet.isEmpty()) {
                const entry = new JoinEntry(1);
                AutoRole.joinTimedSet.add(entry);
            } else {
                const entry: JoinEntry = AutoRole.joinTimedSet.rawSet.keys().next().value;
                AutoRole.joinTimedSet.refresh(entry);
                entry.increment();
                if (entry.joinCount > settings.massJoinProtection) {
                    DiscordUtils.postToLog(`More than ${settings.massJoinProtection} has joined this server in 10 seconds, panic mode is enabled`, guildId);
                    await this.saveSettings(guildId, {
                        panicMode: true
                    }, true);
                    settings.panicMode = true;
                }
            }
        }
        if (await this.doPanic(member, settings)) {
            return;
        }
        if (settings.minAccountAge > 0) {
            const convertedTime = TimeUtils.convertToMilli(settings.minAccountAge, TIME_UNIT.days);
            const memberCreated = member.user.createdAt.getTime();
            const now = Date.now();
            const accountAge = now - memberCreated;
            if (accountAge < convertedTime) {
                const accountAgeHuman = ObjectUtil.secondsToHuman(convertedTime / 1000);
                try {
                    await GuildUtils.applyYoungAccountConstraint(member, accountAgeHuman);
                } catch {
                }
                return;
            }
        }
        if (settings.autoRoleTimeout > 0) {
            const now = Date.now();
            const timeout = settings.autoRoleTimeout;
            const toAddRole = now + timeout;
            const d = new Date(toAddRole);
            schedule.scheduleJob(`enable ${member.user.tag}`, d, async () => {
                await this.applyRole(member, guildId, true);
            });
        } else {
            await this.applyRole(member, guildId, false);
        }
    }

    @On("guildMemberRemove")
    private async specialLeave([member]: ArgsOf<"guildMemberRemove">, client: Client): Promise<void> {
        if (!await this.isEnabled(member.guild.id)) {
            return;
        }
        const jailRole = await GuildUtils.RoleUtils.getJailRole(member.guild.id);
        if (!jailRole) {
            return;
        }
        const model = await this._roleApplier.roleLeaves(jailRole, member as GuildMember, RolePersistenceModel);
        if (model) {
            try {
                // @ts-ignore
                await super.commitToDatabase(model, {}, true);
            } catch (e) {
                if (e instanceof UniqueViolationError) {
                    return;
                }
            }
        }
    }
}