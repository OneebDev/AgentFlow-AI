import finalResultModel from '../models/final-result.model';

export default {
    createFinalResult: (payload: any) => {
        return finalResultModel.create(payload);
    },
    findByJobId: (jobId: string) => {
        return finalResultModel.findOne({ jobId });
    }
};
