// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
rootProject.name = "aws-jetbrains-toolkit"

include("ktlint-rules")
include("resources")
include("telemetry-client")
include("core")
include("jetbrains-core")
include("jetbrains-ultimate")
include("jetbrains-rider")
include("ui-tests")

plugins {
    id("com.gradle.enterprise").version("3.4.1")
}

gradleEnterprise {
    buildScan {
        obfuscation {
            username { "<username>"}
            hostname { "<hostname>"}
            ipAddresses { it.map { "0.0.0.0"} }
        }
    }
}
