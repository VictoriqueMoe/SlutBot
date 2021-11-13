import {ArgsOf, Client} from "discordx";
import {ArrayUtils, DiscordUtils, Ffmpeg, GuildUtils, ObjectUtil} from "../../utils/Utils";
import {Collection, MessageEmbed} from "discord.js";
import {BannedAttachmentsModel} from "../../model/DB/guild/BannedAttachments.model";
import fs from "fs";
import {MessageListenerDecorator} from "../../model/decorators/messageListenerDecorator";
import {ResourceBanner} from "../../commands/customAutoMod/ResourceBanner";
import {Main} from "../../Main";
import {DirResult} from "tmp";
import {singleton} from "tsyringe";
import {getRepository} from "typeorm";
import ffmpeg = require("ffmpeg");

const isVideo = require('is-video');
const tmp = require('tmp');

const {basename, join} = require('path');
const sanitize = require('sanitize-filename');
const md5 = require('md5');

@singleton()
export class ResourceListener {
    private static readonly MAX_SIZE_BYTES: number = 10485760;


    @MessageListenerDecorator(true)
    private async scanAttachments([message]: ArgsOf<"messageCreate">, client: Client): Promise<void> {
        const member = message.member;
        if (!member) {
            return;
        }
        const attachments = message.attachments;
        const messageContent = message.content;
        const attachmentUrl: string[] = attachments.map(attachmentObject => attachmentObject.attachment as string);

        if (ObjectUtil.validString(messageContent)) {
            const urlsInMessage = ObjectUtil.getUrls(messageContent);
            if (urlsInMessage && urlsInMessage.size > 0) {
                attachmentUrl.push(...urlsInMessage.values());
            }
        }
        const embeds = message.embeds;
        if (ArrayUtils.isValidArray(embeds)) {
            for (const embed of embeds) {
                if (embed.video) {
                    attachmentUrl.push(embed.video.url);
                }
            }
        }
        let shouldDelete = false;
        let reason: string = null;
        for (const url of attachmentUrl) {
            let attachment;
            try {
                attachment = await DiscordUtils.loadResourceFromURL(url);
            } catch {
                continue;
            }
            let attachmentHash = "";
            try {
                attachmentHash = md5(attachment);
            } catch {
                return;
            }
            const exists = await getRepository(BannedAttachmentsModel)
                .createQueryBuilder("bannedAttachmentsModel")
                .where("bannedAttachmentsModel.guildId :guildId", {
                    guildId: message.guild.id
                })
                .andWhere("bannedAttachmentsModel.attachmentHash = :hash OR bannedAttachmentsModel.url = :url", {
                    hash: attachmentHash,
                    url
                }).getOne();
            /*const exists = await BannedAttachmentsModel.findOne({
                where: {
                    guildId: message.guild.id,
                    [Op.or]: [
                        {
                            attachmentHash
                        }, {
                            url
                        }
                    ]
                }
            });*/
            if (exists) {
                shouldDelete = true;
                reason = exists.reason;
                break;
            }
        }
        if (shouldDelete) {
            try {
                const member = message.member;
                await message.delete();
                message.reply("Message contains a banned attachment");
                DiscordUtils.postToLog(`Member: <@${member.id}> posted a banned attachment "${reason}"`, message.guild.id);
                if (member) {
                    await GuildUtils.sendToJail(member, `you have been placed here because you sent an attachment that was banned for the reason: "${reason}"`);
                }
            } catch {
            }
        }
    }

    //TODO: disabled
    // @MessageListenerDecorator(true, notBot)
    private async discordMessageCrash([message]: ArgsOf<"messageCreate">, client: Client): Promise<void> {
        if (Main.testMode && message.member.id !== "697417252320051291") {
            return;
        }
        const messageContent = message.content;
        let urlsInMessage: Set<string> = new Set();
        if (ObjectUtil.validString(messageContent)) {
            urlsInMessage = ObjectUtil.getUrls(messageContent);
        }
        const embeds = message.embeds;
        if (ArrayUtils.isValidArray(embeds)) {
            for (const embed of embeds) {
                if (embed.video) {
                    urlsInMessage.add(embed.video.url);
                }
            }
        }
        const attatchmentArray = message.attachments || new Collection();
        if (attatchmentArray.size === 0 && urlsInMessage.size === 0) {
            return;
        }
        const urls = attatchmentArray.map(value => (value.attachment as string));
        if (urlsInMessage && urlsInMessage.size > 0) {
            urls.push(...urlsInMessage.values());
        }
        const vidTemp = tmp.dirSync({
            unsafeCleanup: true
        });
        let didBan = false;
        let errors: string[] = [];
        try {
            for (const urlToAttachment of urls) {
                if (!isVideo(urlToAttachment)) {
                    continue;
                }

                let fail = false;
                let attachment: Buffer;
                try {
                    attachment = await DiscordUtils.loadResourceFromURL(urlToAttachment);
                } catch {
                    continue;
                }
                const attachmentHash = md5(attachment);

                const exists = await getRepository(BannedAttachmentsModel).count({
                    where: {
                        attachmentHash,
                        guildId: message.guild.id
                    }
                }) === 1;
                if (exists && !Main.testMode) {
                    continue;
                }
                const size = Buffer.byteLength(attachment);
                if (size > ResourceListener.MAX_SIZE_BYTES) {
                    continue;
                }
                const fileName = join(vidTemp.name, sanitize(basename(urlToAttachment)));
                try {
                    fs.writeFileSync(fileName, attachment);
                } catch {
                    continue;
                }
                let video;
                try {
                    video = await new ffmpeg(fileName);
                } catch {
                    continue;
                }
                if (ObjectUtil.validString(video.metadata.video.container)) {
                    const container: string = video.metadata.video.container;
                    if (container.includes("image")
                        || container.includes("gif")) {
                        continue;
                    }
                }

                const encoding: string = video.metadata.video.codec;
                if (ObjectUtil.validString(encoding)) {
                    if (encoding !== "AVC" && encoding !== "h264") {
                        continue;
                    }
                }
                try {
                    errors = await Ffmpeg.checkVideo(fileName, ResourceListener.MAX_SIZE_BYTES);
                    if (ArrayUtils.isValidArray(errors)) {
                        const videoErrorExpanded = this._analyseError(errors);
                        if (ArrayUtils.isValidArray(videoErrorExpanded)) {
                            errors = videoErrorExpanded;
                            console.error(`possible not an error ${fileName} \n${errors}`);
                            fail = true;
                        }
                    }
                } catch (e) {
                    console.error(`possible not an error ${fileName} \n ${e}`);
                    fail = true;
                }
                if (fail && !Main.testMode) {
                    await ResourceBanner.doBanAttachment(attachment, "Discord crash video", urlToAttachment, message.guild.id);
                    try {
                        await message.delete();
                    } catch (e) {
                        console.error(e);
                    }
                    didBan = true;
                }
            }
        } finally {
            this._cleanup(vidTemp);
        }
        if (didBan || Main.testMode) {
            const messageToRespond = `This item is a Discord crash video and has been deleted`;
            message.reply(messageToRespond);
            const messageMember = message.member;
            const descriptionPostfix = `that contains suspicious code in <#${message.channel.id}>, this is a discord crash video. the first 10 errors are as shown below: `;
            const embed = new MessageEmbed()
                .setColor('#337FD5')
                .setAuthor(messageMember.user.tag, GuildUtils.getGuildIconUrl(message.guild.id))
                .setDescription(`someone posted a video ${descriptionPostfix}`)
                .setTimestamp();
            if (messageMember) {
                const avatarUrl = messageMember.user.displayAvatarURL({dynamic: true});
                embed.setAuthor(messageMember.user.tag, avatarUrl);
                embed.setDescription(`<@${messageMember.id}> posted a video ${descriptionPostfix}`);
            }
            errors.slice(0, 10).forEach((value, index) => {
                embed.addField(`hex dump #${index + 1}`, value);
            });
            DiscordUtils.postToLog([embed], message.guild.id);
            GuildUtils.sendToJail(messageMember, "you have been placed here because you posted a discord crash video");
        }
    }

    private _analyseError(errors: string[]): string[] {
        const retArray: string[] = [];
        for (const error of errors) {
            const innerErrorArray = error.split(/\r?\n/);
            for (const innerIfno of innerErrorArray) {
                if (innerIfno.includes("Frame parameters mismatch context")) {
                    retArray.push(innerIfno);
                }
            }
        }
        return retArray;
    }

    private _cleanup(...paths: DirResult[]): void {
        for (const lPath of paths) {
            if (lPath) {
                try {
                    lPath.removeCallback();
                } catch {
                    fs.rmdirSync(lPath.name, {recursive: true});
                }
            }
        }
    }
}