import {DiscordUtils, ObjectUtil} from "../utils/Utils";
import {ArgsOf, GuardFunction} from "discordx";
import {CommandSecurityManager} from "../model/guild/manager/CommandSecurityManager";
import {getPrefix} from "../Main";
import {CommandInteraction, GuildMember} from "discord.js";

export const secureCommand: GuardFunction<ArgsOf<"messageCreate">> = async (
    [message],
    client,
    next
) => {
    const prefix = await getPrefix(message);
    const commandName = message.content.split(prefix)[1].split(" ")[0];
    if (!ObjectUtil.validString(commandName)) {
        return;
    }
    const canRun = await CommandSecurityManager.instance.canRunCommand(message.member, commandName);
    const isEnabled = await CommandSecurityManager.instance.isEnabled(commandName, message.guild.id);
    if (canRun && isEnabled) {
        return await next();
    }
    message.reply("you do not have permissions to use this command");
};

export const secureCommandInteraction: GuardFunction<CommandInteraction> = async (arg, client, next) => {
    const commandName = arg.commandName;
    let member: GuildMember = null;
    let guildId = "";
    if (arg.member instanceof GuildMember) {
        member = arg.member;
    }
    guildId = arg.guildId;
    if (!ObjectUtil.validString(commandName) || !ObjectUtil.validString(guildId) || !member) {
        return DiscordUtils.InteractionUtils.replyWithText(arg, "Unable to execute command", false, true);
    }
    const canRun = await CommandSecurityManager.instance.canRunCommand(member, commandName);
    const isEnabled = await CommandSecurityManager.instance.isEnabled(commandName, guildId);
    if (canRun && isEnabled) {
        return next();
    }
    return DiscordUtils.InteractionUtils.replyWithText(arg, "you do not have permissions to use this command", false, true);
};