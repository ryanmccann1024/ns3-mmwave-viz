# Doxygen input filter for ../README.md (see FILTER_PATTERNS in Doxyfile).
# The README is plain GitHub Markdown; this adds the {#viz_readme_*} section
# ids that the docs pages \ref, and retitles the page "User guide" on the site.
# Renaming a README heading means updating its line here.
1s/^# .*$/# User guide {#viz_readme}/
s/^## Features$/& {#viz_readme_features}/
s/^## Prerequisites$/& {#viz_readme_prerequisites}/
s/^## Getting Started$/& {#viz_readme_getting_started}/
s/^## Loading a Simulation$/& {#viz_readme_loading}/
s/^## Data Format$/& {#viz_readme_data_format}/
s/^## Mission experiments$/& {#viz_readme_missions}/
s/^## Reading RL experiment results$/& {#viz_readme_rl_results}/
s/^### Decisions tab$/& {#viz_readme_decisions}/
s/^## Controls$/& {#viz_readme_controls}/
s/^## Understanding the Visualization$/& {#viz_readme_understanding}/
s/^## Event Log$/& {#viz_readme_event_log}/
s/^## Linting & Code Style$/& {#viz_readme_linting}/
s/^## Architecture Overview$/& {#viz_readme_architecture}/
s/^## Documentation$/& {#viz_readme_docs}/
s/^## Contributing$/& {#viz_readme_contributing}/
