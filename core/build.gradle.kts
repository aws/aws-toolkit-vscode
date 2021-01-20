// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

val awsSdkVersion: String by project
val jacksonVersion: String by project
val coroutinesVersion: String by project
val kotlinVersion: String by project

dependencies {
    api(project(":resources"))
    api(project(":telemetry-client"))
    api("com.fasterxml.jackson.module:jackson-module-kotlin:$jacksonVersion")
    api("com.fasterxml.jackson.datatype:jackson-datatype-jsr310:$jacksonVersion")
    api("com.fasterxml.jackson.dataformat:jackson-dataformat-xml:$jacksonVersion")
    api("software.amazon.awssdk:cognitoidentity:$awsSdkVersion")
    api("software.amazon.awssdk:ecr:$awsSdkVersion")
    api("software.amazon.awssdk:ecs:$awsSdkVersion")
    api("software.amazon.awssdk:lambda:$awsSdkVersion")
    api("software.amazon.awssdk:s3:$awsSdkVersion")
    api("software.amazon.awssdk:sso:$awsSdkVersion")
    api("software.amazon.awssdk:ssooidc:$awsSdkVersion")
    api("software.amazon.awssdk:sts:$awsSdkVersion")

    compileOnly("org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlinVersion")
    compileOnly("org.jetbrains.kotlin:kotlin-reflect:$kotlinVersion")
    compileOnly("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")

    testImplementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlinVersion")
    testImplementation("org.jetbrains.kotlin:kotlin-reflect:$kotlinVersion")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")
}
