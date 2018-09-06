'use strict';

import { AwsContext } from "../awsContext";

export interface IAWSTreeProvider {
    viewProviderId: string;

    initialize(): void;
}

export interface IRefreshableAWSTreeProvider extends IAWSTreeProvider {
    refresh(newContext?: AwsContext): void;
}

