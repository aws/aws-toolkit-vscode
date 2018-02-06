package software.aws.toolkits.jetbrains.ui.options;

import com.intellij.icons.AllIcons;
import com.intellij.ide.util.BrowseFilesListener;
import com.intellij.openapi.options.Configurable;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.TextBrowseFolderListener;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.openapi.ui.ValidationInfo;
import com.intellij.openapi.ui.popup.JBPopupFactory;
import com.intellij.openapi.ui.popup.PopupStep;
import com.intellij.openapi.ui.popup.util.BaseListPopupStep;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.ui.AnActionButton;
import com.intellij.ui.DocumentAdapter;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.ToolbarDecorator;
import com.intellij.ui.components.JBLabel;
import java.awt.BorderLayout;
import java.io.File;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.event.DocumentEvent;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.credentials.AwsCredentialsProfileProvider;
import software.aws.toolkits.jetbrains.credentials.CredentialFileBasedProfile;
import software.aws.toolkits.jetbrains.credentials.CredentialProfile;
import software.aws.toolkits.jetbrains.credentials.CredentialProfileFactory;
import software.aws.toolkits.jetbrains.credentials.ProfileEditor;
import software.aws.toolkits.jetbrains.ui.credentials.CredentialsDialog;
import software.aws.toolkits.jetbrains.ui.credentials.CredentialsTable;
import software.aws.toolkits.jetbrains.ui.credentials.ProfileNameEditor;

public class AwsCredentialsConfigurable implements Configurable, Configurable.NoScroll {
    private final AwsCredentialsProfileProvider optionsProvider;
    private JPanel credentialsPanel;
    private JPanel tablePanel;
    private TextFieldWithBrowseButton credentialFileChooser;
    private JPanel credentialFilePanel;
    private JBLabel errorLabel;
    private CredentialsTable credentialsTable;

    private String currentCredentialFileLocation;

    public AwsCredentialsConfigurable(Project project) {
        optionsProvider = AwsCredentialsProfileProvider.getInstance(project);

        credentialFilePanel.setBorder(IdeBorderFactory.createTitledBorder("Credentials", false));

        credentialFileChooser.addBrowseFolderListener(new TextBrowseFolderListener(BrowseFilesListener.SINGLE_FILE_DESCRIPTOR));
        credentialFileChooser.getTextField().getDocument().addDocumentListener(new CredentialFileChangeListener());

        credentialsTable = new CredentialsTable();

        ToolbarDecorator decorator = ToolbarDecorator.createDecorator(credentialsTable);
        decorator.disableUpDownActions();
        decorator.setAddAction(this::createNewProfile);
        decorator.setEditAction(button -> editProfile());

        tablePanel.add(decorator.createPanel(), BorderLayout.CENTER);
    }

    private void createNewProfile(AnActionButton button) {
        CredentialProfileFactory<? extends CredentialProfile>[] providerFactories = CredentialProfileFactory.credentialProviderTypes();
        // No extensions are registered, go directly to the profile creation, else we will make a pop up menu to give a choice
        if (providerFactories.length == 1) {
            createNewProfile(providerFactories[0]);
        } else {
            createProfileTypePopup(button, providerFactories);
        }
    }

    private void createProfileTypePopup(AnActionButton button, CredentialProfileFactory<? extends CredentialProfile>[] providerFactories) {
        BaseListPopupStep<CredentialProfileFactory<? extends CredentialProfile>> step =
            new BaseListPopupStep<CredentialProfileFactory<? extends CredentialProfile>>(null, providerFactories) {
                @NotNull
                @Override
                public String getTextFor(CredentialProfileFactory<? extends CredentialProfile> value) {
                    return value.getDescription();
                }

                @Override
                public PopupStep onChosen(CredentialProfileFactory<? extends CredentialProfile> selectedValue, boolean finalChoice) {
                    return doFinalStep(() -> createNewProfile(selectedValue));
                }
            };

        JBPopupFactory.getInstance().createListPopup(step).show(button.getPreferredPopupPoint());
    }

    private <T extends CredentialProfile> void createNewProfile(CredentialProfileFactory<T> providerFactory) {
        String title = "Create New " + providerFactory.getDescription().toLowerCase();
        CredentialProfile newProfile = createEditor(title, providerFactory.configurationComponent(), null);
        if (newProfile != null) {
            credentialsTable.getModel().addRow(newProfile);
        }
    }

    private void editProfile() {
        CredentialProfile profileToEdit = credentialsTable.getSelectedObject();
        if (profileToEdit == null) {
            return;
        }

        CredentialProfileFactory factory = CredentialProfileFactory.factoryFor(profileToEdit.getId());

        if (factory == null) {
            throw new IllegalStateException("The factory for " + profileToEdit.getId() + " is missing");
        }

        String title = "Edit " + factory.getDescription();
        CredentialProfile editedProfile = createEditor(title, factory.configurationComponent(profileToEdit), profileToEdit);
        if (editedProfile != null) {
            List<CredentialProfile> items = credentialsTable.getModel().getItems();
            List<CredentialProfile> updatedList = items.stream().filter(p -> p != profileToEdit).collect(Collectors.toList());
            updatedList.add(editedProfile);

            credentialsTable.getModel().setItems(updatedList);
        }
    }

    private CredentialProfile createEditor(String title, ProfileEditor<?> profileEditor, CredentialProfile sourceProfile) {
        CredentialsDialog dialogBuilder = new CredentialsDialog(profileEditor, credentialsPanel);
        dialogBuilder.setTitle(title);
        dialogBuilder.setValidator(credentialsDialog -> {
            // Validate the profile name
            ProfileNameEditor nameEditor = profileEditor.getProfileNameEditor();
            String newName = nameEditor.getValue();
            if (StringUtil.isEmpty(newName)) {
                return new ValidationInfo("Profile name is required", nameEditor.getInput());
            }

            List<CredentialProfile> profiles = credentialsTable.getModel().getItems();
            Optional<CredentialProfile> nameMatch = profiles.stream()
                                                            .filter(p -> newName.equals(p.getName()))
                                                            .findFirst();

            // If this is an edit, see if we are editing the match'ed profile
            if (nameMatch.isPresent()) {
                if (nameMatch.get() != sourceProfile) {
                    return new ValidationInfo("A profile with that name already exists", nameEditor.getInput());
                }
            }

            return null;
        });

        boolean isOkay = dialogBuilder.showAndGet();
        if (isOkay) {
            return profileEditor.commit();
        }

        return null;
    }

    @Nullable
    @Override
    public JComponent createComponent() {
        return credentialsPanel;
    }

    @Override
    public boolean isModified() {
        return !Objects.equals(optionsProvider.getCredentialFileLocation(), currentCredentialFileLocation)
               || !optionsProvider.getProfiles().equals(credentialsTable.getModel().getItems());
    }

    @Override
    public void apply() {
        optionsProvider.setCredentialFileLocation(currentCredentialFileLocation);
        optionsProvider.setProfiles(credentialsTable.getModel().getItems());
    }

    @Override
    public void reset() {
        currentCredentialFileLocation = optionsProvider.getCredentialFileLocation();
        credentialFileChooser.setText(currentCredentialFileLocation);
        credentialsTable.getModel().setItems(new ArrayList<>(optionsProvider.getProfiles()));
    }

    @Nls
    @Override
    public String getDisplayName() {
        return "AWS";
    }

    private class CredentialFileChangeListener extends DocumentAdapter {
        @Override
        protected void textChanged(DocumentEvent event) {
            String newCredentialFileLocation = credentialFileChooser.getText();
            if (Objects.equals(currentCredentialFileLocation, newCredentialFileLocation)) {
                return;
            }

            // Keep all the non-credential file profiles
            List<CredentialProfile> currentProfiles = credentialsTable.getItems();
            List<CredentialProfile> newProfiles = currentProfiles.stream()
                                                                 .filter(this::isCredentialFileBased)
                                                                 .collect(Collectors.toList());

            if (StringUtil.isNotEmpty(newCredentialFileLocation)) {
                File credentialFile = new File(newCredentialFileLocation);
                newProfiles.addAll(loadNewProfiles(credentialFile));
            }
            currentProfiles = newProfiles;
            credentialsTable.getModel().setItems(currentProfiles);
            currentCredentialFileLocation = newCredentialFileLocation;
        }

        private Collection<CredentialProfile> loadNewProfiles(File credentialFile) {
            if (!credentialFile.exists()) {
                errorLabel.setIcon(AllIcons.General.Warning);
                errorLabel.setText("Specified credential file does not exist, will be created");
                errorLabel.setVisible(true);
                return Collections.emptyList();
            }

            try {
                Map<String, CredentialProfile> loadedProfiles = AwsCredentialsProfileProvider
                    .loadFromCredentialProfile(credentialFile);

                errorLabel.setVisible(false);
                return loadedProfiles.values();
            } catch (RuntimeException e) {
                errorLabel.setIcon(AllIcons.General.Error);
                errorLabel.setText("Specified credential file invalid");
                errorLabel.setVisible(true);
                return Collections.emptyList();
            }
        }

        private boolean isCredentialFileBased(CredentialProfile profile) {
            return !(profile instanceof CredentialFileBasedProfile);
        }
    }
}
