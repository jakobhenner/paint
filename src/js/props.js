const props = {
  color: {
    type: Array,
    default () {
      return [Math.random(), 1, 1, 0.8]
    }
  },
  fluidity: {
    type: Number,
    default: 0.9
  },
  bristleCount: {
    type: Number,
    default: 0.6
  },
  brushScale: {
    type: Number,
    default: 0.5
  },
  brushHeight: {
    type: Number,
    default: 2
  },
  roughness: {
    type: Number,
    default: 0.075 // 0.075
  },
  normalScale: {
    type: Number,
    default: 7
  },
  f0: {
    type: Number,
    default: 1.5 // 1.5
  },
  splatVelocityScale: {
    type: Number,
    default: 0.14 //0.14
  },
  splatRadius: {
    type: Number,
    default: 0.05
  },
  maxBristleCount: {
    type: Number,
    default: 100
  },
  minBristleCount: {
    type: Number,
    default: 10
  },
  minBrushScale: {
    type: Number,
    default: 5
  },
  maxBrushScale: {
    type: Number,
    default: 75
  },
  specularScale: {
    type: Number,
    default: 0.5
  },
  diffuseScale: {
    type: Number,
    default: 0.15
  },
  lightDirection: {
    type: Array,
    default () {
      return [0, 1, 1]
    }
  },
  colorModel: {
    type: String,
    default: 'RYB'
  },
  quality: {
    type: Number,
    default: 2
  },
  bindMouseEvents: {
    type: Boolean,
    default: false
  },
  historySize: {
    type: Number,
    default: 4
  }
}

const getDefaultProps = function () {
  const defaultProps = {}

  for (var prop in props) {
    //console.log(prop)

    let value = props[prop].default

    if (typeof value === 'function') {
      value = value()
    }

    defaultProps[prop] = value
  }
  return defaultProps
}

export { getDefaultProps }
export default props
