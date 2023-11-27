/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { FqnExtractor } from "./fqn/extractor";

export * from "./ui/main";

declare global {
    interface Window { fqnExtractor: FqnExtractor; }
}

window.fqnExtractor = new FqnExtractor();
