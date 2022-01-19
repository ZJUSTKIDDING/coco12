import CinematicLankBoss from './CinematicLankBoss'
import Loader from './Loader'
import { parseShot } from './Command/CinematicParser'
import CommandRunner from './Command/CommandRunner'

const createjs = require('lib/createjs-parts')
const LayerAdapter = require('lib/surface/LayerAdapter')
const Camera = require('lib/surface/Camera')

/**
 * Takes a reference of the canvas and uses this to set up all the systems.
 * The canvasDiv will be used by the dialogSystem in order to attach the html dialog div
 * and svg image overlaying the base canvas.
 * Finally the slug is used to load the relevant cinematic data.
 */
export class CinematicController {
  constructor ({ canvas, canvasDiv, slug }) {
    this.systems = {}

    this.stage = new createjs.StageGL(canvas)
    const camera = this.systems.camera = new Camera($(canvas))
    // stubRequiredLayer needed by Lanks as a dependency. We don't attach to canvas.
    this.stubRequiredLayer = new LayerAdapter({ name: 'Ground', webGL: true, camera: camera })

    this.layerAdapter = new LayerAdapter({ name: 'Default', webGL: true, camera: camera })
    this.stage.addChild(this.layerAdapter.container)

    // Count the number of times we are making a new spritesheet
    let count = 0
    this.startupLocks = []
    this.startupLocks.push(new Promise((resolve, reject) => {
      this.layerAdapter.on('new-spritesheet', (_spritesheet) => {
        // This should trigger for each ThangType being loaded and turned into a Lank.
        // Behavior is still unknown so keeping logging.
        // TODO: Eventually remove this logging when we understand the exact behavior.
        console.log('Got a new spritesheet. Count:', ++count)
        resolve()
      })
    }))

    // TODO: Will be moved to camera commands.
    this.systems.camera.zoomTo({ x: 0, y: 0 }, 7, 0)

    this.systems.cinematicLankBoss = new CinematicLankBoss({
      groundLayer: this.stubRequiredLayer,
      layerAdapter: this.layerAdapter,
      camera: this.systems.camera
    })

    this.systems.loader = new Loader({ slug })

    this.startUp()
  }

  /**
   * Method that loads and initializes the cinematic.
   *
   * We load cinematic data and initialize the Lank creation. Creating a lank causes a
   * new spritesheet to be built so we wait for at least one spritesheet to be built.
   *  TODO: Have a reasonable timeout so we don't lock forever in an edge case.
   *
   * Finally we run the cinematic runner.
   */
  async startUp () {
    const data = await this.systems.loader.loadAssets()

    // Todo: Intentionally only parse a single shot for Goal 1.
    const commands = parseShot(data.shots[0], this.systems)

    // TODO: There must be a better way than an array of locks! In future add reasonable timeout with `Promise.race`.
    await Promise.all(this.startupLocks)

    attachListener({ cinematicLankBoss: this.systems.cinematicLankBoss, stage: this.stage })

    const runner = new CommandRunner(commands)
    await runner.run()
  }
}

/**
 * Starts the render loop of the stage.
 * Currently configured for 30 frames per second.
 *
 * The returned listener can be removed from the Ticker in order to pause rendering.
 *
 * ```js
 * // Attach listener
 * const listener = attachListener({ cinematicLankBoss, stage })
 * // Remove listener again
 * createjs.Ticker.removeEventListener('tick', listener)
 * ```
 *
 * @returns {Function} listener that was attached to createjs.Ticker
 */
function attachListener ({ cinematicLankBoss, stage }) {
  createjs.Ticker.framerate = 30
  const listener = () => {
    cinematicLankBoss.update(true)
    stage.update()
  }
  createjs.Ticker.addEventListener('tick', listener)
  // Return listener for removing event.
  return listener
}
