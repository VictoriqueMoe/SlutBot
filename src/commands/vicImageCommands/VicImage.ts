import {CommandMessage, Discord, Guard, SimpleCommand} from "discordx";
import {secureCommand} from "../../guards/RoleConstraint";
import {VicDropbox} from "../../model/dropbox/VicDropbox";
import {NotBot} from "../../guards/NotABot";
import {AbstractCommandModule} from "../AbstractCommandModule";
import {Main} from "../../Main";

@Discord()
export abstract class VicImage extends AbstractCommandModule<any> {

    constructor() {
        super({
            module: {
                name: "VicImage",
                description: "Commands to obtain images of <@697417252320051291>"
            },
            commands: [
                {
                    name: "vicImage",
                    description: {
                        text: `Get a random image of <@697417252320051291>`
                    }
                },
                {
                    name: "vicReIndex",
                    description: {
                        text: "Re-index image metadata from dropbox"
                    }
                }
            ]
        });
    }

    @SimpleCommand("vicImage")
    @Guard(NotBot, secureCommand)
    private async vicImage(command: CommandMessage): Promise<void> {
        const findingMessage = await command.channel.send("Finding image...");
        const randomImageMetadata = VicDropbox.instance.randomImage;
        const randomImage = (await Main.dropBox.filesDownload({"path": randomImageMetadata.path_lower})).result;
        const buffer: Buffer = (randomImage as any).fileBinary;
        try {
            await command.channel.send({
                content: "Found one!",
                files: [{
                    attachment: buffer,
                    name: `${randomImage.name}`
                }]
            });
        } catch (e) {
            command.channel.send("Failed to send, maybe image is too large?");
            console.error(e);
            console.log(`Failed to send ${randomImage.name}`);
        }
        findingMessage.delete();
    }

    @SimpleCommand("vicReIndex")
    @Guard(NotBot, secureCommand)
    private async vicReIndex(command: CommandMessage): Promise<void> {
        await VicDropbox.instance.index();
        command.channel.send(`Re-indexed ${VicDropbox.instance.allImages.length} images from Dropbox`);
    }
}