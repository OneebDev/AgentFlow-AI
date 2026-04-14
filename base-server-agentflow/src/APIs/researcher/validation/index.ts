import Joi from 'joi';

export const startResearchSchema = Joi.object({
    topic: Joi.string().required().min(3),
    format: Joi.string().valid('articles', 'videos', 'products', 'news').optional(),
    language: Joi.string().min(2).optional(),
    outputType: Joi.string().valid('summary', 'list').optional(),
    depth: Joi.string().valid('basic', 'detailed').default('basic'),
    options: Joi.object().optional(),
});
