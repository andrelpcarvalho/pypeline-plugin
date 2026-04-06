# summary

Initialize the pypeline workspace: create baseline.txt, update .gitignore and verify org authentication.

# description

Runs an interactive setup for the current Salesforce project directory:

- Creates baseline.txt with the current HEAD commit (if not present)
- Adds pypeline entries to .gitignore (if missing)
- Checks that the default orgs (devops and treino) are authenticated

Run this command once after cloning or setting up a new workspace.

# examples

- Initialize the workspace in the current directory:

  <%= config.bin %> <%= command.id %>
