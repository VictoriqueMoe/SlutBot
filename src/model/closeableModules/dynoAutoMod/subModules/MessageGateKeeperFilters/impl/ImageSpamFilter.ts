import {InjectDynoSubModule} from "../../../../../decorators/InjectDynoSubModule";
import {MessageGateKeeper} from "../../../../../../events/closeableModules/MessageGateKeeper";
import {AbstractFilter} from "../AbstractFilter";
import {IValueBackedMessageGateKeeperFilter} from "../IValueBackedMessageGateKeeperFilter";
import {TimedSet} from "../../../../../Impl/TimedSet";
import {ICloseableModule} from "../../../../ICloseableModule";
import {ACTION} from "../../../../../../enums/ACTION";
import {PRIORITY} from "../../../../../../enums/PRIORITY";
import {Message} from "discord.js";

@InjectDynoSubModule(MessageGateKeeper)
export class ImageSpamFilter extends AbstractFilter implements IValueBackedMessageGateKeeperFilter {

    private _cooldownArray: TimedSet<MessageSpamEntry>;

    private constructor(parentFilter: ICloseableModule) {
        super(parentFilter);
        this._cooldownArray = new TimedSet(10000);
    }

    /**
     * How many images are allowed at once in the space of 10 seconds
     */
    public get value(): string {
        return "4"; // hard coded for now
    }

    public get actions(): ACTION[] {
        return [ACTION.DELETE, ACTION.WARN, ACTION.MUTE];
    }

    public get id(): string {
        return "Image Spam Filter";
    }

    public get isActive(): boolean {
        return true;
    }

    public get priority(): number {
        return PRIORITY.LAST;
    }

    public get warnMessage(): string {
        return "You are posting too many images, slow down!";
    }

    public doFilter(content: Message): boolean {
        const memberId = content.member.id;
        const attachments = content.attachments;
        if (attachments.size === 0) {
            return true;
        }
        let fromArray = this.getFromArray(memberId);
        if (fromArray) {
            fromArray.count++;
            this._cooldownArray.refresh(fromArray);
        } else {
            fromArray = new MessageSpamEntry(memberId, this);
            this._cooldownArray.add(fromArray);
        }
        return !fromArray.hasViolationLimitReached;

    }

    private getFromArray(userId: string): MessageSpamEntry {
        const arr = this._cooldownArray.rawSet;
        return arr.find(value => value.userId === userId);
    }
}

class MessageSpamEntry {
    public count: number;

    constructor(public userId: string, private _instance: ImageSpamFilter) {
        this.count = 1;
    }

    public get hasViolationLimitReached(): boolean {
        return this.count > Number.parseInt(this._instance.value);
    }
}
