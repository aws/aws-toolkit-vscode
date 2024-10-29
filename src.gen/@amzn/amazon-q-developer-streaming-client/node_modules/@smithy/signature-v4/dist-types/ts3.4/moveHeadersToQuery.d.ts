import { HttpRequest as IHttpRequest, QueryParameterBag } from "@smithy/types";
/**
 * @private
 */
export declare const moveHeadersToQuery: (request: IHttpRequest, options?: {
    unhoistableHeaders?: Set<string>;
    hoistableHeaders?: Set<string>;
}) => IHttpRequest & {
    query: QueryParameterBag;
};
