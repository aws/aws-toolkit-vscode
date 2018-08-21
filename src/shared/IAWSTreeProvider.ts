'use strict';

import { AWSContext } from "./awsContext";

export interface IAWSTreeProvider {
    viewProviderId: string;

    initialize(): void;
}

export interface IRefreshableAWSTreeProvider extends IAWSTreeProvider {
    refresh(newContext?: AWSContext): void;
}

