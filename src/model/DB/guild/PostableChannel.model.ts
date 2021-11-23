import {GuildableModel} from "./Guildable.model.js";
import {AbstractModel} from "../AbstractModel.js";
import typeorm from "typeorm";
const { Column, Entity, JoinColumn, ManyToOne } = typeorm;

@Entity()
export class PostableChannelModel extends AbstractModel {

    @Column({unique: true, default: null, nullable: true})
    public logChannel: string;

    @Column({unique: true, default: null, nullable: true})
    public AdminLogchannel: string;

    @Column({unique: true, default: null, nullable: true})
    public JailChannel: string;

    @ManyToOne(() => GuildableModel, guildableModel => guildableModel.postableChannels, AbstractModel.cascadeOps)
    @JoinColumn({name: AbstractModel.joinCol})
    guildableModel: GuildableModel;
}