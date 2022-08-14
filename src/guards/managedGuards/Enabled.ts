import type {CommandInteraction, Message} from "discord.js";
import type {CloseableModule} from "../../model/closeableModules/impl/CloseableModule.js";
import {Typeings} from "../../model/Typeings.js";
import {container} from "tsyringe";
import EventTriggerCondition = Typeings.EventTriggerCondition;

export function Enabled(service: typeof CloseableModule<unknown>): EventTriggerCondition {
    return function (message: Message | CommandInteraction): Promise<boolean> {
        const serviceResolves = container.resolve<CloseableModule<unknown>>(service as any);
        return serviceResolves.isEnabled(message.guildId);
    };
}
