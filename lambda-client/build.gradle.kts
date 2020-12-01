// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

val awsSdkVersion: String by project

dependencies {
    implementation("software.amazon.awssdk:services:$awsSdkVersion")
    implementation("software.amazon.awssdk:aws-json-protocol:$awsSdkVersion")
    runtimeOnly("software.amazon.awssdk:core:$awsSdkVersion")
}

apply(plugin = "toolkit-generate-sdk")
