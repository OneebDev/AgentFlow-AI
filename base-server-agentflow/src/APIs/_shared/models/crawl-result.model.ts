import mongoose from 'mongoose';

const crawlResultSchema = new mongoose.Schema(
    {
        jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AgentJob',
            required: true,
            index: true,
        },
        sourceType: {
            type: String,
            required: true,
        },
        rawData: {
            type: mongoose.Schema.Types.Mixed,
            default: [],
        },
        fetchedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { versionKey: false }
);

export default mongoose.model('CrawlResult', crawlResultSchema);
