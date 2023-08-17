import { BodyValidator, ERRORS, JSONLike, JsonPrimitive, JsonStruct, MAX_DEPTH, MAX_KEYS, MAX_KEY_LENGTH, MAX_SIZE, ParserConfig, ParserResult } from "./lib.js";
import { FormDataParser, JSONParser, URLParamsParser } from "./parser.js";

export class Bodyguard {

    config: ParserConfig;
    validator?: BodyValidator;

    /**
     * Constructs a Bodyguard instance with the provided configuration or defaults to preset values.
     * @param {BodyguardConfig} config - Configuration settings to initialize the Bodyguard instance.
     * @param {number} config.maxKeys - Maximum number of keys.
     * @param {number} config.maxDepth - Maximum depth of an object or array.
     * @param {number} config.maxSize - Maximum size of a request body in bytes.
     * @param {number} config.maxKeyLength - Maximum length of a key in characters.
     * @example
     * const bodyguard = new Bodyguard({
     *     maxKeys: 100, // Maximum number of keys.
     *     maxDepth: 10, // Maximum depth of an object or array.
     *     maxSize: 1024 * 1024, // Maximum size of a request body in bytes.
     *     maxKeyLength: 100, // Maximum length of a key in characters.
     *     validate: (obj, schema) => ({ success: true, value: obj }
     * });
     */
    constructor(config: Partial<ParserConfig> & { validator?: BodyValidator } = {
        maxKeys: MAX_KEYS,
        maxDepth: MAX_DEPTH,
        maxSize: MAX_SIZE,
        maxKeyLength: MAX_KEY_LENGTH,
    }) {
        this.config = {
            maxKeys: config.maxKeys && typeof config.maxKeys === 'number' && config.maxKeys > 0 ? config.maxKeys : MAX_KEYS,
            maxDepth: config.maxDepth && typeof config.maxDepth === 'number' && config.maxDepth > 0 ? config.maxDepth : MAX_DEPTH,
            maxSize: config.maxSize && typeof config.maxSize === 'number' && config.maxSize > 0 ? config.maxSize : MAX_SIZE,
            maxKeyLength: config.maxKeyLength && typeof config.maxKeyLength === 'number' && config.maxKeyLength > 0 ? config.maxKeyLength : MAX_KEY_LENGTH,
        };
        if(config.validator) {
            if(typeof config.validator !== 'function') throw new Error(ERRORS.INVALID_VALIDATOR);
            this.validator = config.validator;
        }
    }

    /**
     * Attempts to parse a form from a request. Returns the parsed object in case of success and 
     * an error object in case of failure.
     * @template T - Type parameter for the schema to be validated against.
     * @param {Request} req - Request to parse the form from.
     * @param {T} schema - Optional schema to validate the parsed form against.
     * @return {Promise<ParserResult<T>>} - Result of the parsing operation.
     */
    async softForm<T>(req: Request, schema?: T, config?: Partial<ParserConfig>): Promise<ParserResult<T>> {
        try {
            const res = await this.form(req, schema, config);
            return {
                success: true,
                value: res
            }
        }
        catch(e: any) {
            return {
                success: false,
                error: typeof e === 'string' ? e : e?.message || ""
            }
        }
    }

    /**
     * Attempts to parse JSON from a request. Returns the parsed JSON in case of success and 
     * an error object in case of failure.
     * @template T - Type parameter for the schema to be validated against.
     * @param {Request} req - Request to parse the JSON from.
     * @param {T} schema - Optional schema to validate the parsed JSON against.
     * @return {Promise<ParserResult<T>>} - Result of the parsing operation.
     */
    async softJson<T>(req: Request, schema?: T, config?: Partial<ParserConfig>): Promise<ParserResult<T>> {
        try {
            const res = await this.json(req, schema, config);
            return {
                success: true,
                value: res
            }
        }
        catch(e: any) {
            return {
                success: false,
                error: typeof e === 'string' ? e : e?.message || ""
            }
        }
    }

    constructParserConfig(config?: Partial<ParserConfig>): ParserConfig {
        return {
            maxKeys: config?.maxKeys && typeof config.maxKeys === 'number' && config.maxKeys > 0 ? config.maxKeys : this.config.maxKeys,
            maxDepth: config?.maxDepth && typeof config.maxDepth === 'number' && config.maxDepth > 0 ? config.maxDepth : this.config.maxDepth,
            maxSize: config?.maxSize && typeof config.maxSize === 'number' && config.maxSize > 0 ? config.maxSize : this.config.maxSize,
            maxKeyLength: config?.maxKeyLength && typeof config.maxKeyLength === 'number' && config.maxKeyLength > 0 ? config.maxKeyLength : this.config.maxKeyLength,
        };
    }
    
    /**
     * Parses a form from a request. Form could be urlencoded or multipart.
     * @template T - Type parameter for the schema to be validated against.
     * @param {Request} req - Request to parse the form from.
     * @param {T} schema - Optional schema to validate the parsed form against.
     * @return {Promise<T>} - Parsed form from the request.
     * @throws {Error} - If content-type is not present or is invalid, or the form data is invalid, it throws an error.
     */
    async form<T>(req: Request, schema?: T, config?: Partial<ParserConfig>): Promise<T> {
        if(req.body === null) throw new Error(ERRORS.REQUEST_BODY_NOT_AVAILABLE);
        config = this.constructParserConfig(config || {});

        const contentType = req.headers.get("content-type");
        if (!contentType) throw new Error(ERRORS.NO_CONTENT_TYPE);

        const bodyType = contentType === "application/x-www-form-urlencoded" ? "params" : "formdata";

        let boundary = "";
        if(contentType.includes("boundary")) {
            const match = contentType.match(/boundary=(.*)/);
            if (!match) {
                throw new Error(ERRORS.INVALID_CONTENT_TYPE);
            }
            boundary = match[1];
        }

        const parser = bodyType === "params" ? new URLParamsParser(config as ParserConfig) : new FormDataParser(config as ParserConfig, boundary);
        const ret = await parser.parse(req.body);

        return await this.validate(ret, schema || {}) as T;
    }

    /**
     * Parses JSON from a request.
     * @template T - Type parameter for the schema to be validated against.
     * @param {Request} req - Request to parse the JSON from.
     * @param {T} schema - Optional schema to validate the parsed JSON against.
     * @return {Promise<T>} - Parsed JSON from the request.
     * @throws {Error} - If JSON parsing fails, it throws an error.
     */
    async json<T>(req: Request, schema?: T, config?: Partial<ParserConfig>): Promise<T> {
        if(req.body === null) throw new Error(ERRORS.REQUEST_BODY_NOT_AVAILABLE);
        config = this.constructParserConfig(config || {});

        const parser = new JSONParser(config as ParserConfig);
        const json = await parser.parse(req.body);

        return await this.validate(json, schema || {}) as T;
    }

    async validate<T>(obj: JsonStruct | JsonPrimitive, schema?: T): Promise<T> {
        if(this.validator) {
            const validatorResult = await this.validator(obj, schema);
            if(validatorResult.success) return validatorResult.value as T;
            throw new Error(validatorResult.error);
        }
        return obj as T;
    }

}
