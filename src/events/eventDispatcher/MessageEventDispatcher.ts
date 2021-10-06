import {ArgsOf, Client, Discord, On} from "discordx";
import {MessageEntry} from "./MessageEntry";
import {Message} from "discord.js";
import {Main} from "../../Main";
import {container} from "tsyringe";

@Discord()
export class MessageEventDispatcher {

    private static readonly _messageListenerMap: Map<any, MessageEntry[]> = new Map();

    public static get messageListenerMap(): Map<any, MessageEntry[]> {
        return MessageEventDispatcher._messageListenerMap;
    }

    @On("messageCreate")
    private async eventTrigger([message]: ArgsOf<"messageCreate">, client: Client): Promise<void> {
        await Main.client.executeCommand(message, {
            caseSensitive: false
        });
        return this.trigger(message, client, false);
    }


    @On("messageUpdate")
    private async messageUpdater([oldMessage, newMessage]: ArgsOf<"messageUpdate">, client: Client): Promise<void> {
        if (newMessage.author.bot) {
            return;
        }
        if (!(newMessage instanceof Message)) {
            try {
                newMessage = await newMessage.fetch();
            } catch {
                return;
            }
        }
        return this.trigger(newMessage, client, true);
    }

    private async trigger(message: Message, client: Client, isEdit: boolean = false): Promise<void> {
        const retArr: Promise<void>[] = [];
        for (const [context, entries] of MessageEventDispatcher._messageListenerMap) {
            const contextInstance = container.resolve(context);
            for (const entry of entries) {
                retArr.push(entry.trigger(message, client, contextInstance, isEdit));
            }
        }
        return Promise.all(retArr).then();
    }
}
