// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.resources

import java.io.InputStream

object BundledResources {
    val ENDPOINTS_FILE: InputStream get() = javaClass.getResourceAsStream("endpoints.json")
}
