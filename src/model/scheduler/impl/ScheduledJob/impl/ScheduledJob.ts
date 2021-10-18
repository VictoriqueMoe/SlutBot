import {IScheduledJob} from "../IScheduledJob";
import * as schedule from "node-schedule";

export class ScheduledJob implements IScheduledJob {
    constructor(private _name: string, private _job: schedule.Job, private _cron: string | Date) {
    }

    get name(): string {
        return this._name;
    }

    get job(): schedule.Job {
        return this._job;
    }

    public get cron(): string | Date {
        return this._cron;
    }
}