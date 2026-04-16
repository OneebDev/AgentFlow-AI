import Joi from 'joi';

export const startResearchSchema = Joi.object({
    topic: Joi.string().required().min(1),
    format:     Joi.string().valid('articles', 'videos', 'products', 'news').allow(null).optional(),
    language:   Joi.string().min(2).allow(null).optional(),
    outputType: Joi.string().valid('summary', 'list').allow(null).optional(),
    depth: Joi.string().valid('basic', 'detailed').default('basic'),
    options: Joi.object().optional(),
    history: Joi.array().items(Joi.object({
        role: Joi.string().valid('user', 'agent').required(),
        content: Joi.string().allow('').required()
    })).optional(),
});
