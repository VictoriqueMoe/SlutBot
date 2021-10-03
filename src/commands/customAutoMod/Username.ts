import {UsernameModel} from "../../model/DB/autoMod/impl/Username.model";
import {Discord, Guard, Slash, SlashGroup, SlashOption} from "discordx";
import {NotBotInteraction} from "../../guards/NotABot";
import {secureCommandInteraction} from "../../guards/RoleConstraint";
import {DiscordUtils} from "../../utils/Utils";
import {CommandInteraction, GuildMember, User} from "discord.js";
import {GuildManager} from "../../model/guild/manager/GuildManager";
import {AbstractCommandModule} from "../AbstractCommandModule";
import {container} from "tsyringe";
import InteractionUtils = DiscordUtils.InteractionUtils;

@Discord()
@SlashGroup("username", "Commands to set usernames for people")
export abstract class Username extends AbstractCommandModule<UsernameModel> {

    protected constructor() {
        super({
            module: {
                name: "Username",
                description: "Commands to set usernames for people"
            },
            commands: [
                {
                    name: "viewUsernames",
                    isSlash: true,
                    description: {
                        text: "View all the persisted usernames this bot is aware of"
                    }
                },
                {
                    name: "username",
                    isSlash: true,
                    description: {
                        text: "force a username to always be set to a member, this will automatically apply the username if they leave and rejoin again. \n you can optionally add a block to anyone other than staff member from changing it",
                        examples: ["username @user 'this is a new username' = username will always be 'this is a new username' if they leave and rejoin", "username @user 'this is a new username' true = same as before, but this means they can not change it themselves"],
                        args: [
                            {
                                name: "User",
                                type: "mention",
                                optional: false,
                                description: "The user you want to change nicknames"
                            },
                            {
                                name: "new nickName",
                                type: "text",
                                optional: false,
                                description: "The new nickname for the user"
                            },
                            {
                                name: "Block changes",
                                type: "boolean",
                                optional: true,
                                description: "Block this username from being changed by another other than staff members (as defined in the staff members config)"
                            }
                        ]
                    }
                }
            ]
        });
    }


    @Slash("viewusernames", {
        description: "View all the persisted usernames this bot is aware of"
    })
    @Guard(NotBotInteraction, secureCommandInteraction)
    private async ViewAllSetUsernames(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply();
        const {guild} = interaction;
        const guildId = guild.id;
        const allModels = await UsernameModel.findAll({
            where: {
                guildId
            }
        });
        if (allModels.length === 0) {
            InteractionUtils.editWithText(interaction, "No members in the database");
            return;
        }
        let messageDisplay = `\n`;
        for (const model of allModels) {
            try {
                const member = await guild.members.fetch(model.userId);
                messageDisplay += `\n user: "${member.user.tag}" has a persisted username of "${model.usernameToPersist}"`;
                if (model.force) {
                    messageDisplay += ` Additionally, this user is not allowed to change it`;
                }
            } catch {

            }
        }
        InteractionUtils.editWithText(interaction, messageDisplay);
    }

    @Slash("username", {
        description: "force a username to always be set to a member"
    })
    @Guard(NotBotInteraction, secureCommandInteraction)
    private async setUsername(
        @SlashOption("user", {
            description: "The user you want to change nickname",
            required: true
        })
            mentionedMember: User,
        @SlashOption("newnickname", {
            description: "The new nickname for the user",
            required: true
        })
            usernameToPersist: string,
        @SlashOption("blockchanges", {
            description: "Block this username from being changed by another other than staff members",
            required: false
        })
            force: boolean = false,
        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply();
        if (!(mentionedMember instanceof GuildMember)) {
            return InteractionUtils.replyWithText(interaction, "Unable to find user", false);
        }
        const guildId = interaction.guild.id;
        const guildManager = container.resolve(GuildManager);
        const guild = await guildManager.getGuild(guildId);
        const bot = await DiscordUtils.getBot(guild.id);
        const botHighestRole = bot.roles.highest;
        const roleOfMember = mentionedMember.roles.highest;
        if (roleOfMember.position > botHighestRole.position) {
            return InteractionUtils.replyWithText(interaction, "You can not use this command against a member who's highest role is above this bots highest role", false);
        }
        const callee = InteractionUtils.getInteractionCaller(interaction);
        if (!(callee instanceof GuildMember)) {
            return InteractionUtils.replyWithText(interaction, "Internal Error", false);
        }
        if (roleOfMember.position >= callee.roles.highest.position) {
            return InteractionUtils.replyWithText(interaction, "You can not use this command against a member who's role is higher than yours!", false);
        }
        const userId = mentionedMember.id;
        if (await UsernameModel.count({
            where: {
                userId,
                guildId
            }
        }) > 0) {
            await UsernameModel.update(
                {
                    usernameToPersist,
                    force
                },
                {
                    where: {
                        userId,
                        guildId
                    }
                }
            );
        } else {
            const obj = {
                userId,
                usernameToPersist,
                force,
                guildId
            };

            const model = new UsernameModel(obj);
            try {
                await super.commitToDatabase(model, undefined, true);
            } catch (e) {
            }
        }
        await mentionedMember.setNickname(usernameToPersist);
        InteractionUtils.editWithText(interaction, `user ${mentionedMember.user.username} has been persisted to always be "${usernameToPersist}"`);
    }
}