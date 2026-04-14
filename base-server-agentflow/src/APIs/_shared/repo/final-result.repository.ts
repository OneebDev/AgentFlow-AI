import finalResultModel from '../models/final-result.model';

export default {
    createFinalResult: (jobId: string, data: any) => {
        return finalResultModel.create({ jobId, ...data });
    },
    findByJobId: (jobId: string) => {
        return finalResultModel.findOne({ jobId });
    }
};
