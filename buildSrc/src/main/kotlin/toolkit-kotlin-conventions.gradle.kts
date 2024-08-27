import io.gitlab.arturbosch.detekt.Detekt
import io.gitlab.arturbosch.detekt.DetektCreateBaselineTask
import io.gitlab.arturbosch.detekt.DetektPlugin
import org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension

// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

plugins {
    id("java-library")
    id("toolkit-detekt")
    id("toolkit-jvm-conventions")
}

// TODO: https://github.com/gradle/gradle/issues/15383
val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
dependencies {
    // kotlin/kotlin-coroutines might not be necessary if we're in an intellij-plugin-based module
    // - The dependency on the Kotlin Standard Library (stdlib) is automatically added when using the Gradle Kotlin plugin and may conflict with the version provided with the IntelliJ Platform, see: https://jb.gg/intellij-platform-kotlin-stdlib
    //- The Kotlin Coroutines library should not be added explicitly to the project as it is already provided with the IntelliJ Platform.
    implementation(versionCatalog.findBundle("kotlin").get())
    implementation(versionCatalog.findLibrary("kotlin-coroutines").get())

    testFixturesApi(versionCatalog.findLibrary("kotlin-test").get())
    testFixturesApi(versionCatalog.findLibrary("kotlin-coroutinesDebug").get()) {
        // IDE provides JNA and results in conflicts
        exclude(group = "net.java.dev.jna", module = "jna")
    }
    testFixturesApi(versionCatalog.findLibrary("kotlin-coroutinesTest").get())
    testFixturesApi(versionCatalog.findLibrary("mockk").get())
}

sourceSets {
    main {
        java {
            setSrcDirs(listOf("src"))
        }
        resources {
            setSrcDirs(listOf("resources"))
        }
    }

    test {
        java {
            setSrcDirs(listOf("tst"))
        }
        resources {
            setSrcDirs(listOf("tst-resources"))
        }
    }
}

project.afterEvaluate {
    tasks.check {
        dependsOn(tasks.detekt, tasks.detektMain, tasks.detektTest)

        tasks.findByName("detektIntegrationTest")?.let {
            dependsOn(it)
        }
    }
}

// can't figure out why exclude() doesn't work on the generated source tree, so copy logic from detekt
project.extensions.getByType(KotlinJvmProjectExtension::class.java).target.compilations.configureEach {
    val inputSource = kotlinSourceSets
        .map { it.kotlin.sourceDirectories.filter { !it.path.contains("build") } }
        .fold(project.files() as FileCollection) { collection, next -> collection.plus(next) }

    tasks.named<Detekt>(DetektPlugin.DETEKT_TASK_NAME + name.capitalize()).configure {
        setSource(inputSource)
    }

    tasks.named<DetektCreateBaselineTask>(DetektPlugin.BASELINE_TASK_NAME + name.capitalize()).configure {
        setSource(inputSource)
    }
}
