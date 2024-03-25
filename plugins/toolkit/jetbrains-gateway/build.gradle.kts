// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import net.bytebuddy.utility.RandomString
import org.jetbrains.intellij.tasks.PrepareSandboxTask
import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-detekt")
    id("toolkit-testing")
    id("toolkit-intellij-subplugin")
    id("toolkit-integration-testing")
}

intellij {
    pluginName.set("aws-toolkit-jetbrains")
    type.set("GW")
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.GW)
}

val gatewayRunOnly by configurations.creating {
    extendsFrom(configurations.getByName(JavaPlugin.RUNTIME_CLASSPATH_CONFIGURATION_NAME))
    isCanBeResolved = true
}

dependencies {
    // link against :j-c: and rely on :intellij:buildPlugin to pull in :j-c:instrumentedJar, but gateway variant when runIde/buildPlugin from :jetbrains-gateway
    compileOnly(project(":plugin-toolkit:jetbrains-core"))
    gatewayRunOnly(project(":plugin-toolkit:jetbrains-core", "gatewayArtifacts"))

    testImplementation(project(path = ":plugin-toolkit:core", configuration = "testArtifacts"))
    testCompileOnly(project(":plugin-toolkit:jetbrains-core"))
    testRuntimeOnly(project(":plugin-toolkit:jetbrains-core", "gatewayArtifacts"))
    testImplementation(project(path = ":plugin-toolkit:jetbrains-core", configuration = "testArtifacts"))
    testImplementation(libs.kotlin.coroutinesTest)
    testImplementation(libs.kotlin.coroutinesDebug)
    testImplementation(libs.wiremock)
    testImplementation(libs.bundles.sshd)
}

listOf("compileClasspath", "runtimeClasspath").forEach { configuration ->
    configurations.named(configuration) {
        // definitely won't be used in Gateway
        setOf(
            libs.aws.apprunner,
            libs.aws.cloudformation,
            libs.aws.cloudcontrol,
            libs.aws.cloudwatchlogs,
            libs.aws.dynamodb,
            libs.aws.ec2,
            libs.aws.ecr,
            libs.aws.ecs,
            libs.aws.lambda,
            libs.aws.rds,
            libs.aws.redshift,
            libs.aws.secretsmanager,
            libs.aws.schemas,
            libs.aws.sns,
            libs.aws.sqs,
        ).forEach {
            val dep = it.get().module
            exclude(group = dep.group, module = dep.name)
        }
    }
}

val gatewayResources = configurations.create("gatewayResources") {
    isCanBeResolved = false
}

val toolkitInstallationScripts = tasks.register<Tar>("generateTar") {
    archiveFileName.set("scripts.tar.gz")
    compression = Compression.GZIP
    from("gateway-resources/remote")
    // set all files as:
    //           r-xr-xr-x
    fileMode = 0b101101101
}

val gatewayResourcesDir = tasks.register<Sync>("gatewayResourcesDir") {
    from("gateway-resources/caws-proxy-command.bat", toolkitInstallationScripts)
    into("$buildDir/$name")

    includeEmptyDirs = false
}

artifacts {
    add(gatewayResources.name, gatewayResourcesDir)
}

tasks.jar {
    duplicatesStrategy = DuplicatesStrategy.WARN
}

tasks.withType<PrepareSandboxTask>().all {
    intoChild(pluginName.map { "$it/gateway-resources" })
        .from(gatewayResourcesDir)
}

tasks.prepareSandbox {
    runtimeClasspathFiles.set(gatewayRunOnly)
}

tasks.buildPlugin {
    val classifier = if (archiveClassifier.get().isNullOrBlank()) {
        "GW"
    } else {
        "${archiveClassifier.get()}-GW"
    }

    archiveClassifier.set(classifier)
}

val publishToken: String by project
val publishChannel: String by project
tasks.publishPlugin {
    token.set(publishToken)
    channels.set(publishChannel.split(",").map { it.trim() })
}

tasks.integrationTest {
    val testToken = RandomString.make(32)
    environment("CWM_HOST_STATUS_OVER_HTTP_TOKEN", testToken)
}
