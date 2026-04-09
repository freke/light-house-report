{
  pkgs,
  lib,
  config,
  ...
}:
{
  # https://devenv.sh/languages/
  languages.javascript = {
    enable = true;
    npm = {
      enable = true;
      install.enable = true;
    };
  };

  packages = [
    pkgs.google-lighthouse
    pkgs.chromium
  ];
  # See full reference at https://devenv.sh/reference/options/
}
