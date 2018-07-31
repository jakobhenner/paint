<template>
  <div id="app">
    <div class="paint">
      <paint ref="paint" v-bind="props" />
    </div>
    {{props.playing}}
    {{props.position}}
  </div>
</template>

<script>
import gsap from 'gsap'
import dat from 'dat.gui'

import Paint from './components/Paint'

import props, { getDefaultProps } from '@/js/props'

export default {
  name: 'App',
  components: {
    Paint
  },
  methods: {
    setInteractiveProps () {
      this.gui = new dat.GUI();

      this.gui.addColor(this.props, 'color')

      this.gui.add(this.props, 'fluidity', 0.2, 0.9)
      this.gui.add(this.props, 'bristleCount', 0, 1)
      this.gui.add(this.props, 'brushScale', 0, 1)
      this.gui.add(this.props, 'brushHeight', 0, 4.5)
      this.gui.add(this.props, 'splatVelocityScale', 0, 10)
      this.gui.add(this.props, 'splatRadius', 0, 0.5)


      this.gui.add(this.props, 'roughness', 0, 1)
      this.gui.add(this.props, 'f0', 0, 10)
      this.gui.add(this.props, 'normalScale', 0, 10)
      this.gui.add(this.props, 'diffuseScale', 0, 10)
      this.gui.add(this.props, 'specularScale', 0, 10)
      //this.gui.add(this.props, 'lightDirection', 0, 10)

      const lightDirection = this.gui.addFolder("lightDirection");
      Object.keys(this.props.lightDirection).forEach((key) => {
        lightDirection.add(this.props.lightDirection, key, -3, 3);
      });

      this.gui.add(this.props, 'minBristleCount', 1, 100, 1)
      this.gui.add(this.props, 'maxBristleCount', 1, 100, 1)
      this.gui.add(this.props, 'minBrushScale', 1, 1000, 1)
      this.gui.add(this.props, 'maxBrushScale', 1, 1000, 1)
      this.gui.add(this.props, 'colorModel', {
        natural: 'RYB',
        digital: 'RGB'
      })
      this.gui.add(this.props, 'quality', 0.5, 2, 0.1)
      this.gui.add(this.props, 'clear')
    },
    drawTestAnimation () {
      const radius = this.$refs.paint.painter.canvas.width / 2 - 10
      const circle = { angle: 0 }

      this.props.playing = true

      gsap.to(circle, 0.9, {
        angle: 360,
        ease: Power4.easeIn,
        onUpdate: () => {
          const x =  (radius * 1.5) * Math.cos(circle.angle)
          const y = (radius * 1.5) * Math.sin(circle.angle)

          this.props.position = {
            x: this.$refs.paint.painter.canvas.width / 2 + (x * (Math.random() / 2)),
            y: this.$refs.paint.painter.canvas.height / 2 + (y * (Math.random() / 2))
          }
        },
        onComplete: () => {
          setTimeout(() => {
            this.props.playing = false
          }, 700)
        }
      })
    },
    drawCircle (angle) {
      const _angle = angle * Math.PI / 180

      const radius = this.painter.canvas.width / 2 - (this.painter.props.brushScale * 100) - 10

      return {
        x: this.painter.canvas.width / 2 + radius * Math.cos(_angle),
        y: this.painter.canvas.height / 2 + radius * Math.sin(_angle)
      }
    }
  },
  data () {
    const defaults = {
      ...getDefaultProps(),
      clear: () => {
        this.$refs.paint.clear()
      }
    }
    const overrides = {
      fluidity: 0.9,
      brushScale: 0.4,
      splatVelocityScale: 5.9,
      roughness: 0,
      f0: 4.6,
      normalScale: 5.5,
      diffuseScale: 0,
      specularScale: 1.06,
      lightDirection: [-1, -1.6, -0.1],
      color: [0.9, 2.2, 1, -0],
      bindMouseEvents: false,
      playing: false
    }
    const props = {...defaults, ...overrides}

    return {
      props
    }
  },
  mounted () {
    this.setInteractiveProps()
    this.drawTestAnimation()
  },
  beforeDestroy () {
    this.gui.destroy()
  }
}
</script>

<style>
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  user-select: none;
  font-family: -apple-system, Helvetica;
}

#app {
  min-width: 100vw;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.paint {
  position: relative;
  outline: 2px solid grey;
  width: 500px;
  height: 500px;
}
</style>
