/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsProvider } from "./credentials";

export interface EnvironmentCredentialsProvider extends CredentialsProvider {

    /**
     * Determines if the provider is currently capable of producing credentials.
     */
    isAvailable(): Promise<boolean>

}
