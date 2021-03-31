// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

val awsSdkVersion: String by project

plugins {
    id("toolkit-generate-sdks")
}

sdkGenerator {
    c2jFolder.set(file("$projectDir/codegen-resources"))
    outputDir.set(file("$buildDir/generated-sources"))
}
