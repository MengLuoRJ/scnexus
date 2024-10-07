/**
 * @see https://sc2mapster.github.io/ui/2018/02/07/testing-map-without-editor.html
 */
export type GameExecutableParameters = {
  /**
   * Runs the specified map.
   *
   * Map filename. Can be relative or absolute path. Relative path assumes Maps\ folder under SC2 installation folder.
   *
   * @type {string}
   * @example `-run "MyMap.SC2Map"`, `-run "D:\Path\To\MyMap.SC2Map"`
   */
  run?: string;
  /**
   * Mod filename. Can be relative or absolute path. Relative path assumes root SC2 installation folder.
   * @type {string}
   * @example `-testmod "Mods\MyMod.SC2Mod;ComponentList.SC2Components"`
   * @example `-testmod "D:\Path\To\MyMod.SC2Mod;ComponentList.SC2Components"`
   */
  testmod?: string;
  /**
   * Sets wether SC2 should be run windowed or fullscreen
   *
   * `0` - Windowed
   *
   * `1` - Windowed Fullscreen
   *
   * `2` - Fullscreen
   */
  displaymode?: number;
  /**
   * Causes the Trigger Debug window to open on load finish.
   */
  trigdebug?: boolean;
  /**
   * Sets wether resources should be preloaded or not
   *
   * `0` - No
   *
   * `1` - Yes
   */
  preload?: number;
  /**
   * Unknown
   */
  NoUserCheats?: boolean;
  /**
   * Unknown
   */
  reloadcheck?: boolean;
  /**
   * Sets default Melee Mode when loading a melee map
   *
   * `Liberty`
   *
   * `Swarm`
   *
   * `Void`
   */
  meleeMod?: string;
  /**
   * Sets the AI difficulty
   * 
   * `1` - Casual
   *
   * `2` - Normal
   *
   * `3`- Hard
   *
   * `4`- Brutal
   */
  difficulty?: number;
  /**
   * Sets the initial game speed
   *
   * `0` - Slower
   *
   * `1` - Slow
   *
   * `2` - Normal
   *
   * `3`- Fast
   *
   * `4`- Faster
   */
  speed?: number;
};
