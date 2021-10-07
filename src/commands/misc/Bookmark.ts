import {ContextMenu, Discord, Guard, Slash, SlashGroup, SlashOption} from "discordx";
import {AbstractCommandModule} from "../AbstractCommandModule";
import {BookmarkModel} from "../../model/DB/Bookmark.model";
import {NotBotInteraction} from "../../guards/NotABot";
import {secureCommandInteraction} from "../../guards/RoleConstraint";
import {CommandInteraction, ContextMenuInteraction, MessageEmbed} from "discord.js";
import {injectable} from "tsyringe";
import {BookmarkManager} from "../../model/guild/manager/BookmarkManager";
import {ArrayUtils, DiscordUtils} from "../../utils/Utils";
import InteractionUtils = DiscordUtils.InteractionUtils;

@Discord()
@SlashGroup("bookmarks", "Commands to manage bookmarks")
@injectable()
export class Bookmark extends AbstractCommandModule<BookmarkModel> {
    constructor(private _bookmarkManager: BookmarkManager) {
        super({
            module: {
                name: "Bookmarks",
                description: "Commands to manage bookmarks"
            },
            commands: [
                {
                    name: "bookmark",
                    type: "contextMenu",
                    description: {
                        text: "Bookmark a message",
                        args: [
                            {
                                name: "messageUrl",
                                type: "text",
                                description: "the URL of the message",
                                optional: false
                            }
                        ]
                    }
                },
                {
                    name: "getbookmark",
                    type: "slash",
                    description: {
                        text: "Get all of your bookmarks",
                        args: [
                            {
                                name: "private",
                                type: "boolean",
                                description: "Make this message private",
                                optional: false
                            }
                        ]
                    }
                },
                {
                    name: "deleteBookmarks",
                    type: "slash",
                    description: {
                        text: "Delete a bookmark",
                        args: [
                            {
                                name: "id",
                                type: "text",
                                description: "Id of the bookmark to delete",
                                optional: false
                            }
                        ]
                    }
                }
            ]
        });
    }


    @ContextMenu("MESSAGE", "bookmark")
    @Guard(NotBotInteraction, secureCommandInteraction)
    private async addBookmark(interaction: ContextMenuInteraction): Promise<void> {
        await interaction.deferReply({
            ephemeral: true
        });
        const message = await InteractionUtils.getMessageFromContextInteraction(interaction);
        if (!message) {
            return InteractionUtils.replyWithText(interaction, "Unable to find message");
        }
        const caller = InteractionUtils.getInteractionCaller(interaction);
        if (!caller) {
            return InteractionUtils.replyWithText(interaction, "Unable to add bookmark");
        }
        await this._bookmarkManager.addBookmark(caller, message);
        InteractionUtils.replyWithText(interaction, "Bookmark added");
    }

    @Slash("getbookmark", {
        description: "Gets all of your saved bookmarks"
    })
    @Guard(NotBotInteraction, secureCommandInteraction)
    private async getbookmark(
        @SlashOption("private", {
            description: "make message private",
            required: false
        })
            ephemeral: boolean,
        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply({
            ephemeral
        });
        const caller = InteractionUtils.getInteractionCaller(interaction);
        if (!caller) {
            return InteractionUtils.replyWithText(interaction, "Unable to get bookmarks");
        }
        const bookMarks = await this._bookmarkManager.getBookmarksFromMember(caller);
        const displayHexColor = caller.displayHexColor;
        const avatarUrl = caller.user.displayAvatarURL({dynamic: true});
        const embed = new MessageEmbed()
            .setColor(displayHexColor)
            .setTitle(`Your bookmarks`)
            .setAuthor(caller.user.tag, avatarUrl)
            .setTimestamp();
        if (!ArrayUtils.isValidArray(bookMarks)) {
            embed.setDescription("No bookmarks saved");
        }
        for (const bookmark of bookMarks) {
            const first20 = `${bookmark.content.substring(0, 20)} ...`;
            const messageDate = bookmark.createdAt;
            const month = messageDate.getUTCMonth() + 1;
            const day = messageDate.getUTCDate();
            const year = messageDate.getUTCFullYear();
            const date = year + "/" + month + "/" + day;
            embed.addField(`${first20}`, `By: <@${bookmark.author.id}> on ${date} \n[Jump to Message](${bookmark.url})\nID: ${bookmark.id}`);
        }
        interaction.editReply({
            embeds: [embed]
        });
    }

    @Slash("deletebookmarks", {
        description: "Delete a bookmark"
    })
    @Guard(NotBotInteraction, secureCommandInteraction)
    private async deleteBookmarks(
        @SlashOption("id", {
            description: "ID of the bookmark",
            required: true
        })
            bookmarkId: string,
        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply({
            ephemeral: true
        });
        const caller = InteractionUtils.getInteractionCaller(interaction);
        if (!caller) {
            return InteractionUtils.replyWithText(interaction, "Unable to delete bookmark");
        }
        const deleteResult = await this._bookmarkManager.deleteBookmark(caller, bookmarkId);
        if (deleteResult) {
            return InteractionUtils.replyWithText(interaction, `Bookmark ${bookmarkId} has been deleted`);
        }
        return InteractionUtils.replyWithText(interaction, `Bookmark ${bookmarkId} not found, please run /getbookmark for a list of ids`);
    }
}