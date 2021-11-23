import {BaseDAO} from "../../../DAO/BaseDAO.js";
import {PostableChannelModel} from "../../DB/guild/PostableChannel.model.js";
import {BaseGuildTextChannel} from "discord.js";
import {ObjectUtil} from "../../../utils/Utils.js";
import {GuildManager} from "./GuildManager.js";
import {singleton} from "tsyringe";
import typeorm from "typeorm";
const { getRepository } = typeorm;

@singleton()
export class ChannelManager extends BaseDAO<PostableChannelModel> {

    public constructor(private _guildManager: GuildManager) {
        super();
    }

    private static getModel(guildId: string, attra: "logChannel" | "AdminLogchannel" | "JailChannel"): Promise<PostableChannelModel> {
        return getRepository(PostableChannelModel).findOne({
            select: [attra],
            where: {
                guildId
            }
        });
    }

    public async setChannel(guildId: string, channelType: "logChannel" | "AdminLogchannel" | "JailChannel", value: string): Promise<PostableChannelModel[] | null> {
        const result = await getRepository(PostableChannelModel).update({
            guildId
        }, {
            [channelType]: value
        });
        if (result.affected === 0) {
            return null;
        }
        return result[1];
    }

    public async getLogChannel(guildId: string): Promise<BaseGuildTextChannel | null> {
        const model = await ChannelManager.getModel(guildId, "logChannel");
        if (!model || !ObjectUtil.validString(model.logChannel)) {
            return null;
        }
        const channelId = model.logChannel;
        return await this.getChannel(guildId, channelId);
    }

    public async getAdminLogChannel(guildId: string): Promise<BaseGuildTextChannel | null> {
        const model = await ChannelManager.getModel(guildId, "AdminLogchannel");
        if (!model || !ObjectUtil.validString(model.AdminLogchannel)) {
            return null;
        }
        const channelId = model.AdminLogchannel;
        return await this.getChannel(guildId, channelId);
    }

    public async getJailChannel(guildId: string): Promise<BaseGuildTextChannel | null> {
        const model = await ChannelManager.getModel(guildId, "JailChannel");
        if (!model || !ObjectUtil.validString(model.JailChannel)) {
            return null;
        }
        const channelId = model.JailChannel;
        return await this.getChannel(guildId, channelId);
    }

    private async getChannel(guildId: string, channelId: string): Promise<BaseGuildTextChannel | null> {
        const guild = await this._guildManager.getGuild(guildId);
        const channel = await guild.channels.resolve(channelId);
        if (channel instanceof BaseGuildTextChannel) {
            return channel;
        }
        throw new Error(`"${channel.name}" is NOT text channel`);
    }
}