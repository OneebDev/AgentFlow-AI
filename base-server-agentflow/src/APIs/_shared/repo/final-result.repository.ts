import finalResultModel from '../models/final-result.model';
import { IFinalResultData } from '../types/agents.interface';

export default {
    createFinalResult: (jobId: string, data: IFinalResultData) => {
        return finalResultModel.create({ jobId, ...data });
    },
    findByJobId: (jobId: string) => {
        return finalResultModel.findOne({ jobId });
    }
};
