import mongoose from 'mongoose';
import { EJobStatus } from '../types/agents.interface';

const agentJobSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        query: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: EJobStatus,
            default: EJobStatus.PENDING,
            required: true,
            index: true,
        },
        errorMessage: {
            type: String,
            default: null,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

export default mongoose.model('AgentJob', agentJobSchema);
