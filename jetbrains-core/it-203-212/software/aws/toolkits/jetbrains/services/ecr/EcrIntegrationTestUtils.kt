// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

object EcrIntegrationTestUtils {
    fun getImagePrefix(imageId: String): String = "sha256:$imageId"
}
