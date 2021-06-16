// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
rootProject.name = "aws-toolkit-jetbrains"

include("resources")
include("sdk-codegen")
include("core")
include("jetbrains-core")
include("jetbrains-ultimate")
include("jetbrains-rider")
include("intellij")
include("ui-tests")
include("detekt-rules")

plugins {
    id("com.gradle.enterprise").version("3.4.1")
    id("com.github.burrunan.s3-build-cache").version("1.2")
}

gradleEnterprise {
    buildScan {
        obfuscation {
            username { "<username>" }
            hostname { "<hostname>" }
            ipAddresses { it.map { "0.0.0.0" } }
        }
    }
}

if (System.getenv("CI") != null) {
    buildCache {
        local {
            isEnabled = false
        }

        remote<com.github.burrunan.s3cache.AwsS3BuildCache> {
            region = System.getenv("AWS_REGION")
            bucket = System.getenv("S3_BUILD_CACHE_BUCKET")
            prefix = System.getenv("S3_BUILD_CACHE_PREFIX")
            isPush = true
            lookupDefaultAwsCredentials = true
        }
    }
}
