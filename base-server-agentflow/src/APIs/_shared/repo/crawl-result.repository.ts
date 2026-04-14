import crawlResultModel from '../models/crawl-result.model';

export default {
    createCrawlResult: (jobId: string, sourceType: string, rawData: any) => {
        return crawlResultModel.create({
            jobId,
            sourceType,
            rawData
        });
    },
    findByJobId: (jobId: string) => {
        return crawlResultModel.find({ jobId });
    }
};
