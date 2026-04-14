import agentJobModel from '../models/agent-job.model';
import { EJobStatus } from '../types/agents.interface';

export default {
    createJob: (payload: any) => {
        return agentJobModel.create(payload);
    },
    findJobById: (id: string) => {
        return agentJobModel.findById(id);
    },
    updateJobStatus: (id: string, status: EJobStatus, errorMessage: string | null = null) => {
        return agentJobModel.findByIdAndUpdate(
            id,
            { status, errorMessage },
            { new: true }
        );
    },
    updateJobMetadata: (id: string, metadata: any) => {
        return agentJobModel.findByIdAndUpdate(
            id,
            { $set: { metadata } },
            { new: true }
        );
    }
};
