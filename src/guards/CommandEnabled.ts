import {DiscordUtils} from "../utils/Utils";
import {Client, GuardFunction, Next, SimpleCommandMessage} from "discordx";
import {CommandSecurityManager} from "../model/guild/manager/CommandSecurityManager";
import {CommandInteraction, ContextMenuInteraction} from "discord.js";
import {container} from "tsyringe";
import {ModelEnabledConfigure} from "../model/Impl/ModelEnabledConfigure";

export function CommandEnabled(manager?: ModelEnabledConfigure): GuardFunction<CommandInteraction | SimpleCommandMessage | ContextMenuInteraction> {

    return async function (arg: CommandInteraction | SimpleCommandMessage | ContextMenuInteraction, client: Client, next: Next) {
        let commandName = "";
        let guildId = "";
        if (arg instanceof SimpleCommandMessage) {
            commandName = arg.name;
            guildId = arg.message.guild.id;
        } else {
            if (arg.isContextMenu() || arg.isCommand()) {
                commandName = arg.commandName;
                guildId = arg.guildId;
            }
        }
        const securityManager = container.resolve(CommandSecurityManager);
        const commandEnabled = manager && manager.enabled;
        if (commandEnabled && await securityManager.isEnabled(commandName, guildId)) {
            return next();
        }
        if (arg instanceof SimpleCommandMessage) {
            const {message} = arg;
            return message.reply("This command is not enabled");
        } else {
            return DiscordUtils.InteractionUtils.replyOrFollowUp(arg, `This command is not enabled`, true);
        }
    };
}
