// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.platform.gradle.Constants.Configurations.Attributes
import org.jetbrains.intellij.platform.gradle.extensions.IntelliJPlatformTestingExtension
import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.findFolders
import software.aws.toolkits.gradle.intellij.IdeVersions

plugins {
    id("java")
    id("idea")
    id("toolkit-testing")
}

val integrationTests: SourceSet = sourceSets.maybeCreate("integrationTest")
sourceSets {
    integrationTests.apply {
        java.setSrcDirs(listOf("it"))
        resources.srcDirs(listOf("it-resources"))

        compileClasspath += main.get().output + test.get().output
        runtimeClasspath += main.get().output + test.get().output

        // different convention for intellij projects
        plugins.withType<ToolkitIntellijSubpluginPlugin>().configureEach {
            val ideProfile = IdeVersions.ideProfile(project)
            java.srcDirs(findFolders(project, "it", ideProfile))
            resources.srcDirs(findFolders(project, "it-resources", ideProfile))
        }
    }
}

configurations.named("integrationTestCompileClasspath").configure {
    extendsFrom(configurations.getByName(JavaPlugin.TEST_COMPILE_CLASSPATH_CONFIGURATION_NAME))
    attributes {
        attribute(Attributes.extracted, true)
        attribute(Attributes.collected, true)
    }
}

configurations.named("integrationTestRuntimeClasspath").configure {
    extendsFrom(configurations.getByName(JavaPlugin.TEST_RUNTIME_CLASSPATH_CONFIGURATION_NAME))
    attributes {
        attribute(Attributes.extracted, true)
        attribute(Attributes.collected, true)
    }
    isCanBeResolved = true
}

// Add the integration test source set to test jar
val testJar = tasks.named<Jar>("testJar").configure {
    from(integrationTests.output)
}

idea {
    module {
        testSourceDirs = testSourceDirs + integrationTests.java.srcDirs
        testResourceDirs = testResourceDirs + integrationTests.resources.srcDirs
    }
}
val integrationTestConfiguration: Test.() -> Unit = {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the integration tests."
    testClassesDirs = integrationTests.output.classesDirs
    classpath += integrationTests.runtimeClasspath

    ciOnly {
        environment.remove("AWS_ACCESS_KEY_ID")
        environment.remove("AWS_SECRET_ACCESS_KEY")
        environment.remove("AWS_SESSION_TOKEN")
    }

    mustRunAfter(tasks.test)
}

extensions.findByType<IntelliJPlatformTestingExtension>()?.let {
    val integrationTest by it.testIde.registering {
        task {
            integrationTestConfiguration(this)
        }
    }
} ?: run {
    val integrationTest by tasks.registering(Test::class, integrationTestConfiguration)
}

tasks.check {
    dependsOn(integrationTests.compileJavaTaskName, integrationTests.getCompileTaskName("kotlin"))
}
