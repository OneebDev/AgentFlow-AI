import mongoose from 'mongoose';

const finalResultSchema = new mongoose.Schema(
    {
        jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AgentJob',
            required: true,
            unique: true,
            index: true,
        },
        bestResult: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        rankedList: {
            type: mongoose.Schema.Types.Mixed,
            default: [],
        },
        summary: {
            type: String,
            default: null,
        },
        keyPoints: {
            type: [String],
            default: [],
        },
        contract: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        completedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { versionKey: false }
);

export default mongoose.model('FinalResult', finalResultSchema);
