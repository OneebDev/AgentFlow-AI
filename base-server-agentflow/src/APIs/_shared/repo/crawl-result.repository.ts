import crawlResultModel from '../models/crawl-result.model';
import { TCrawlResult, TSourceType } from '../types/agents.interface';

export default {
    createCrawlResult: (jobId: string, sourceType: TSourceType, rawData: TCrawlResult[]) => {
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
