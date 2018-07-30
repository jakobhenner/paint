<template>
  <canvas />
</template>

<script>
import gsap from 'gsap'
import map from '../js/map'
import WrappedGL from '../js/wrappedgl'
import Paint from '../js/paint'

import props from '../js/props'


export default {
  name: 'Paint',
  props: {
    ...props
  },
  methods: {
    drawCircle (angle) {
      const _angle = angle * Math.PI / 180

      const radius = this.painter.canvas.width / 2 - (this.painter.props.brushScale * 100) - 10

      return {
        x: this.painter.canvas.width / 2 + radius * Math.cos(_angle),
        y: this.painter.canvas.height / 2 + radius * Math.sin(_angle)
      }
    },
    clear () {
      this.painter.clear()
    },
    rgba2hsva(rgba) {
      var r = rgba[0]/255,
          g = rgba[1]/255,
          b = rgba[2]/255;

      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var delta = max - min;

      var h = 0;
      var s = max === 0 ? 0 : delta / max;
      var v = max;

      if (max === min) {
          h = 0; // achromatic
      } else {
          switch (max) {
              case r: h = (g < b ? 6 : 0) + (g - b) / delta;
                  break;
              case g: h = 2 + (b - r) / delta;
                  break;
              case b: h = 4 + (r - g) / delta;
                  break;
          }
          h *= 60;
      }
     return [ h, s, v, rgba[3] ];
    }
  },
  computed: {
    _brushScale () {
      return Math.floor(map(this.brushScale, 0, 1, this.minBrushScale, this.maxBrushScale))
    },
    _bristleCount () {
      return Math.floor(map(this.bristleCount, 0, 1, this.minBristleCount, this.maxBristleCount))
    },
    _color () {
      return this.rgba2hsva(this.color)
    }
  },
  watch: {
    '$props': {
      handler (old, mutation) {
        for (let prop in props) {
          if (this.painter.props.hasOwnProperty(prop)) {
            this.painter.props[prop] = this.$props[prop]
          }
        }
      },
      deep: true
    },
    _color () {
      this.painter.brushColorHSVA = this._color
    },
    _bristleCount () {
      this.painter.brush.setBristleCount(this._bristleCount)
    },
    _brushScale () {
      this.painter.brushScale = this._brushScale
    },
    fluidity () {
      this.painter.simulator.fluidity = this.fluidity
    },
    colorModel () {
      this.painter.colorModel = this.colorModel
    },
    quality () {
      this.painter.resolutionScale = this.quality
    }
  },
  mounted () {
    const canvas = this.$el
    const wgl = WrappedGL.create(canvas)

    if (wgl !== null && wgl.hasFloatTextureSupport()) {
      this.painter = new Paint(canvas, wgl, this.$props);
    } else {
      // Error
    }

    const radius = this.painter.canvas.width / 2 - (this.painter.props.brushScale * 100) - 10

    const test = { angle: 0 }

    const circle = {
      x: radius * Math.cos(test.angle),
      y: radius * Math.sin(test.angle)
    }

    const position = {
      x: this.painter.canvas.width / 2 + (circle.x * Math.random()),
      y: this.painter.canvas.height / 2 + (circle.y * Math.random())
    }

    //this.painter.initDraw(position.x, position.y)
    this.painter.initDraw()

    let time = performance.now()
    let first = false

    gsap.to(test, 0.9, {
      angle: 360,
      //ease: Power0.easeNone,
      ease: Power4.easeIn,
      onUpdate: () => {
        const now = performance.now()

        // if (now - time < 300) return false
        //const position = this.drawCircle(test.angle)

        const radius = this.painter.canvas.width / 2 - (this.painter.props.brushScale * 100) - 10

        const circle = {
          x: (radius / 1.5) * Math.cos(test.angle),
          y: (radius / 1.5) * Math.sin(test.angle)
        }

        const position = {
          x: this.painter.canvas.width / 2 + (circle.x * Math.random()),
          y: this.painter.canvas.height / 2 + (circle.y * Math.random())
        }

        this.painter.draw(position.x, position.y)
      },
      onComplete: () => {
        this.painter.stopDraw()
      }
    })

  }
}
</script>

<style scoped>
canvas {
  position: absolute;
  width: 60vh;
  height: 60vh;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  /*filter: contrast(1.05);*/
}
</style>
