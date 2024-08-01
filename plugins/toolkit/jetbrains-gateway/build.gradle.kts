// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:OptIn(kotlin.io.encoding.ExperimentalEncodingApi::class)

import net.bytebuddy.utility.RandomString
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask
import org.jetbrains.kotlin.gradle.internal.ensureParentDirsCreated
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ
import kotlin.io.encoding.Base64

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-detekt")
    id("toolkit-testing")
    id("toolkit-intellij-subplugin")
    id("toolkit-integration-testing")
    id("toolkit-publishing-conventions")
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.GW)
}

intellijPlatform {
    projectName = "aws-toolkit-jetbrains"
}

sourceSets {
    create("gatewayOnly") {
        java {
            resources {
                srcDir("resources-gatewayOnly")
            }
        }
    }
}

val gatewayOnlyRuntimeOnly by configurations.getting {
    extendsFrom(configurations.getByName(JavaPlugin.RUNTIME_CLASSPATH_CONFIGURATION_NAME))
}

val gatewayOnlyRuntimeClasspath by configurations.existing
val processGatewayOnlyResources by tasks.existing
val gatewayOnlyResourcesJar by tasks.registering(Jar::class) {
    archiveClassifier.set("gatewayOnlyResources")
    from(processGatewayOnlyResources)
}

listOf(
    "intellijPlatformDependency",
    "intellijPlatformDependency_integrationTest",
    "intellijPluginVerifierIdesDependency",
).forEach { configurationName ->
    configurations[configurationName].dependencies.addLater(
        toolkitIntelliJ.version().map {
            dependencies.create(
                group = "com.jetbrains.gateway",
                name = "JetBrainsGateway",
                version = it,
            )
        }
    )
}

dependencies {
    intellijPlatform {
        pluginVerifier()

        testFramework(TestFrameworkType.Bundled)
    }

    // link against :j-c: and rely on :intellij-standalone:composeJar to pull in :j-c:instrumentedJar, but gateway variant when from :jetbrains-gateway
    compileOnly(project(":plugin-toolkit:jetbrains-core"))
    gatewayOnlyRuntimeOnly(project(":plugin-toolkit:jetbrains-core", "gatewayArtifacts"))
    // delete when fully split
    gatewayOnlyRuntimeOnly(project(":plugin-core:core"))
    gatewayOnlyRuntimeOnly(project(":plugin-core:jetbrains-community"))
    gatewayOnlyRuntimeOnly(project(":plugin-core:resources"))
    gatewayOnlyRuntimeOnly(project(":plugin-core:sdk-codegen"))

    testImplementation(project(path = ":plugin-core:core", configuration = "testArtifacts"))
    testImplementation(project(":plugin-core:core"))
    testCompileOnly(project(":plugin-toolkit:jetbrains-core"))
    testRuntimeOnly(project(":plugin-toolkit:jetbrains-core", "gatewayArtifacts"))
    testImplementation(testFixtures(project(":plugin-core:jetbrains-community")))
    testImplementation(project(path = ":plugin-toolkit:jetbrains-core", configuration = "testArtifacts"))
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

tasks.prepareJarSearchableOptions {
    enabled = false
}

tasks.jar {
    duplicatesStrategy = DuplicatesStrategy.WARN
}

tasks.withType<PrepareSandboxTask>().configureEach {
    intoChild(intellijPlatform.projectName.map { "$it/gateway-resources" })
        .from(gatewayResourcesDir)
}

listOf(
    tasks.prepareSandbox,
    tasks.prepareTestSandbox
).forEach {
    it.configure {
        runtimeClasspath.setFrom(gatewayOnlyRuntimeClasspath)

        dependsOn(gatewayOnlyResourcesJar)
        intoChild(intellijPlatform.projectName.map { "$it/lib" })
            .from(gatewayOnlyResourcesJar)
    }
}

tasks.buildPlugin {
    val classifier = if (archiveClassifier.get().isNullOrBlank()) {
        "GW"
    } else {
        "${archiveClassifier.get()}-GW"
    }

    archiveClassifier.set(classifier)
}

tasks.integrationTest {
    val testToken = RandomString.make(32)
    environment("CWM_HOST_STATUS_OVER_HTTP_TOKEN", testToken)
}

tasks.verifyPlugin {
    doFirst {
        ides.forEach { ide ->
            val productInfo = ide.resolve("product-info.json")
            val moduleDescriptors = ide.resolve("modules").resolve("module-descriptors.jar")
            if (productInfo.isFile && !moduleDescriptors.isFile) {
                logger.warn("modules/module-descriptors.jar does not exist in $ide. This is probably a JetBrains platform bug")
                moduleDescriptors.ensureParentDirsCreated()
                // hack create an empty zip
                moduleDescriptors.outputStream().use {
                    it.write(Base64.decode("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=="))
                }
            }
        }
    }
}
