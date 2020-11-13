// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

val ktlintVersion: String by project
val kotlinVersion: String by project

dependencies {
    implementation("com.pinterest.ktlint:ktlint-core:$ktlintVersion")
    implementation("com.pinterest.ktlint:ktlint-ruleset-standard:$ktlintVersion")
    implementation("com.pinterest.ktlint:ktlint-ruleset-experimental:$ktlintVersion")
    testImplementation("com.pinterest.ktlint:ktlint-test:$ktlintVersion")
    testImplementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlinVersion")
}
