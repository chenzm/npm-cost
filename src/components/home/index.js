/**
 * @Author: eason
 * @Date:   2017-06-11T12:22:01+08:00
 * @Last modified by:   eason
 * @Last modified time: 2017-06-11T22:57:13+08:00
 */



import { h, Component } from 'preact'
import { route } from 'preact-router'

import Echarts from 'echarts-for-react'
import prettyBytes from '../../lib/prettyBytes'
import AutoComplete from 'react-autocomplete'
import debounce from 'debounce'
import cx from 'classnames'
import ProgressBar from '../progress'
import SearchTags from '../searchTags'

import fetch from 'unfetch'
import style from './style'

export default class Home extends Component {
  state = {
    value: '',
    suggestions: [],
    rotation: 0,
    results: {},
    lists: [],
  }

  componentDidMount() {
    const query = this.props.p;

    if (query && query.trim()) {
      this.setState({ value: query })
      this.performSearch(query)
    }
  }

  handleInputChange = ({ target }) => {
    this.setState({ value: target.value })
    const trimmedValue = target.value.trim()
    const { name } = this.getPackageNameAndVersion(trimmedValue)

    if (trimmedValue.length > 1) {
      this.getSuggestions(name)
    }
  }

  getSuggestions = debounce(
    value => {
      fetch(`https://api.npms.io/v2/search/suggestions?q=${value}`)
        .then(result => result.json())
        .then(result => {
          this.setState({
            suggestions: result.sort((packageA, packageB) => {
              if (
                Math.abs(
                  Math.log(packageB.searchScore) -
                  Math.log(packageA.searchScore),
                ) > 1
              ) {
                return packageB.searchScore - packageA.searchScore
              } else {
                return packageB.score.detail.popularity -
                  packageA.score.detail.popularity
              }
            }),
          })
        })
    },
    200,
  )

  fireEvent = (category, action, label) => {
    if (typeof ga === 'function') {
      ga('send', {
        hitType: 'event',
        eventCategory: category,
        eventAction: action,
        eventLabel: label,
      })
    }
  }

  performSearch = (query) => {
    const startTime = performance.now()
    const packageString = query.toLowerCase().trim()
    this.setState({ promiseState: 'pending', results: [] })
    this.fireEvent('Search', 'Perform Search', packageString)

    fetch(`/package?name=${packageString}&record=true`)
      .then(result => {
        ga && ga('send', {
          hitType: 'timing',
          timingCategory: 'Response time',
          timingVar: 'fetchTime',
          timingValue: (performance.now() - startTime) / 1000,
        })

        if (result.ok) {
          return result.json()
        } else {
          if (result.status === 503) {
            alert(
              'Uh-oh. This is taking longer than expected. We\'ve queued your request. Check back in a minute?',
            )

            this.fireEvent('Search', 'Search Failure 503', packageString)
          } else if (result.status === 404) {
            alert(`Package '${packageString}' not found.`)
            this.fireEvent('Search', 'Search Failure 404', this.state.value)
          } else {
            alert(
              `Could not create a bundle for the package '${packageString}'. If you're sure this package is meant to be used in a browser, the package may not have a correct entry point and peerDependencies specified.`,
            )
            this.fireEvent('Search', 'Search Failure Other', packageString)
          }
          return Promise.reject(result.json())
        }
      })
      .then(data => {
        this.fireEvent('Search', 'Search Success', packageString)
        const lists = this.state.lists
        this.setState({
          results: data,
          value: `${data.package}@${data.version}`,
          rotation: 0,
          lists: lists.map(e => e.package).indexOf(data.package) === -1 ? [data, ...lists] : lists,
        })

        console.log(this.state.lists);

        history.replaceState(0,0,`/?p=${data.package}@${data.version}`);
      })
      .catch(err => {
        this.setState({
          promiseState: 'rejected',
        })

        console.error(err)
      })
  }

  handleProgressDone = () => {
    this.setState(
      {
        promiseState: 'fulfilled',
      },
      () => {
        setTimeout(
          () => {
            this.setState({
              rotation: Math.min(
                this.state.results.size / 1024 / 100 * 100,
                180,
              ),
            })
          },
          100,
        )
      },
    )
  }

  handleSubmit = e => {
    if (e) {
      e.preventDefault()
    }

    this.performSearch(this.state.value)
    route(`/?p=${this.state.value}`)
  }

  getPackageNameAndVersion(packageString) {
    // Scoped packages
    let name, version
    const lastAtIndex = packageString.lastIndexOf('@')

    if (packageString.startsWith('@')) {
      if (lastAtIndex === 0) {
        name = packageString
        version = null
      } else {
        name = packageString.substring(0, lastAtIndex)
        version = packageString.substring(lastAtIndex + 1)
      }
    } else {
      if (lastAtIndex === -1) {
        name = packageString
        version = null
      } else {
        name = packageString.substring(0, lastAtIndex)
        version = packageString.substring(lastAtIndex + 1)
      }
    }

    return { name, version }
  }

  handleSearchTagSelect = (name) => {
    this.fireEvent('Search', 'Search Tag Click', name)
    this.setState({ value: name })
    this.handleSubmit()
  }

  render() {
    const { results, suggestions, value, promiseState, rotation } = this.state
    const { name, version } = this.getPackageNameAndVersion(value)

    const data = this.state.lists.map(e => e).reverse();
    const labels = data.map(e => e.package);
    const size = data.map(e => (e.size / 1000).toFixed(2));
    const gzipSize = data.map(e => (e.gzipSize / 1000).toFixed(2));
    const dependencies = data.map(e => e.dependencies);

    return (
      <div class={style.home}>
        <section className={style.searchSection}>
          <h1> What is the cost <br /> of my npm package ? </h1>
          <form
            onSubmit={this.handleSubmit}
          >
            <div className={style.searchInputContainer}>
              <AutoComplete
                getItemValue={item => item.package.name}
                inputProps={{
                  placeholder: 'find package',
                  className: style.searchInput,
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }}
                onChange={this.handleInputChange}
                autoHighlight={false}
                ref={s => this.searchInput = s}
                value={value}
                items={suggestions}
                onSelect={(value, item) => {
                  this.setState({ value, suggestions: [item] })
                  this.handleSubmit()
                }}
                renderMenu={
                  (items, value, inbuiltStyles) => {
                    return (
                      <div
                        style={{ minWidth: inbuiltStyles.minWidth }}
                        className={ style.suggestionsMenu }
                        children={items}
                      />
                    )
                  }
                }
                wrapperStyle={{
                  display: 'inline-block',
                  width: '100%',
                  position: 'relative',
                }}
                renderItem={(item, isHighlighted) => (
                  <div
                    className={cx(style.suggestion, {
                      [style.highlightedSuggestion]: isHighlighted,
                    })}
                  >
                    <div dangerouslySetInnerHTML={{ __html: item.highlight }} />

                    <div className={style.suggestionDescription}>
                      {item.package.description}
                    </div>

                  </div>
                )}
              />
              <div className={style.dummySearchInput}>
              <span className={style.packageName}>
                {name}
              </span>
                {
                  version !== null && (
                    <span className={style.atSeparator}>
                @
              </span>
                  )
                }
                <span className={style.packageVersion}>
                {version}
              </span>
              </div>
            </div>
          </form>

          {
            !promiseState && (
              <SearchTags onSelect={ this.handleSearchTagSelect } />
            )
          }

          {promiseState &&
          promiseState === 'pending' &&
          <ProgressBar
            isDone={!!results.version}
            onDone={this.handleProgressDone}
          />}

        </section>
        {promiseState &&
        promiseState === 'fulfilled' &&
        <section style={{ marginTop: '-5rem', position: 'relative' }} className={style.displaySection}>
          <div className={style.guageContainer} style={{ display: 'none' }}>
            <div className={style.guageMeter}>
              <div className={style.meterFragmentA} />
              <div
                className={style.meterFragmentC}
                style={{
                  transform: `rotate(${rotation}deg)`,
                }}
              />
              <div className={style.meterFragmentB} />
            </div>
            <div className={style.gauge}>
              <img
                className={style.needle}
                src="../../assets/needle.svg"
                alt=""
                style={{
                  transform: `rotate(${rotation - 90}deg)`,
                }}
              />
              <div className={style.circleOuter}>
                <div className={style.circleInner} />
              </div>
            </div>
          </div>

          <Echarts
            style={{ height: 300, width: '100%' }}
            option={{
              color: [
                "#3fb1e3",
                "#6be6c1",
                "#96dee8",
                "#c6e579",
                "#f4e001",
              ],
              tooltip: {
                trigger: 'axis',
                axisPointer: {
                  type: 'shadow'
                },
              },
              legend: {
                data: ['Minified(kB)', 'Minified + Gzipped(kB)', 'Dependencies']
              },
              xAxis: {
                type: 'value',
                boundaryGap: [0, 0.01]
              },
              yAxis: {
                type: 'category',
                data: labels,
              },
              series: [
                  {
                      name: 'Minified(kB)',
                      type: 'bar',
                      data: size,
                  },
                  {
                      name: 'Minified + Gzipped(kB)',
                      type: 'bar',
                      data: gzipSize,
                  },
                  {
                      name: 'Dependencies',
                      type: 'bar',
                      data: dependencies,
                  },
              ]
            }}
          />

          <ul clasName={style.panelContainer} style={{ listStyle: 'none', width: '100%', marginTop: '5rem' }}>
            <li className={style.epackageItem} style={{ width: '100%', display: 'flex', textAlign: 'right', fontSize: '1.5rem', height: 48, alignItems: 'center', borderBottom: '1px solid rgba(0, 0, 0, .18)' }}>
              <div style={{ width: '20%', textAlign: 'left' }} className={style.epackageName}>Package</div>
              <div style={{ width: '20%' }} className={style.epackageVersion}>Version</div>
              <div style={{ width: '20%' }} className={style.epackageDependencies}>Dependen</div>
              <div style={{ width: '20%' }} className={style.epackageSize}>Size</div>
              <div style={{ width: '20%' }} className={style.epackageSizeGzip}>GzipSize</div>
            </li>
            {
              this.state.lists.map(({ package: name, version, dependencies, size, gzipSize }) => (
                <li className={style.epackageItem} style={{ width: '100%', display: 'flex', textAlign: 'right', height: 32, alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '20%', textAlign: 'left' }} className={style.epackageName}>
                    <a
                      style={{ display: 'inline-block', color: 'inherit', textDecoration: 'none', width: '100%', height: '100%' }}
                      href={`https://www.npmjs.com/package/${name}`}
                      title={`visit npm/${name}`}
                    >
                      { name }
                    </a>
                  </div>
                  <div style={{ width: '20%' }} className={style.epackageVersion}>{ version }</div>
                  <div style={{ width: '20%' }} className={style.epackageDependencies}>{ dependencies }</div>
                  <div style={{ width: '20%' }} className={style.epackageSize}>{ prettyBytes(size) }</div>
                  <div style={{ width: '20%' }} className={style.epackageSizeGzip}>{ prettyBytes(gzipSize) }</div>
                </li>
              ))
            }
          </ul>

          <ul className={style.panelContainer} style={{ display: 'none' }}>
            <li className={style.panel}>
              <h2 className={style.panelData}>

                {prettyBytes(results.size).split(' ')[0]}

                <span className={style.panelUnit}>
                    {prettyBytes(results.size).split(' ')[1]}
                  </span>

              </h2>

              <h4 className={style.panelLabel}> Minified </h4>

            </li>
            <li className={style.panel}>
              <h2 className={style.panelData}>

                {prettyBytes(results.gzipSize).split(' ')[0]}

                <span className={style.panelUnit}>
                    {prettyBytes(results.gzipSize).split(' ')[1]}
                  </span>

              </h2>

              <h4 className={style.panelLabel}> Minified + Gzipped </h4>

            </li>

            <li className={style.panel}>
              <h2 className={style.panelData}>

                {(results.gzipSize / (250 * 1024 / 8)).toFixed(2)}

                <span className={style.panelUnit}> s </span>

              </h2>

              <h4 className={style.panelLabel}>
                Download Over 2G
              </h4>
            </li>
            <li className={style.panel}>
              <h2 className={style.panelData}>

                {(results.gzipSize / (400 * 1024 / 8)).toFixed(2)}

                <span className={style.panelUnit}> s </span>

              </h2>

              <h4 className={style.panelLabel}>
                Download Over 3G
              </h4>
            </li>

            <li className={style.panel}>
              <h2 className={style.panelData}> {results.dependencies} </h2>

              <h4 className={style.panelLabel}>
                Dependencies
              </h4>
            </li>
          </ul>
        </section>}
      </div>
    )
  }
}
