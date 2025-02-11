import {
  Feature, FeatureCollection, GeoJsonProperties, Position,
} from 'geojson';

declare interface Bounds {
  minlat: string,
  minlon: string,
  maxlat: string,
  maxlon: string
}

declare interface Copyright {
  author?: string,
  year?: string,
  license?: string
}

declare interface Link {
  href: string,
  text?: string,
  type?: string
}

declare interface Person {
  name?: string,
  email?: string,
  link?: Link
}

declare interface MetaData {
  name?: string,
  desc?: string,
  author?: Person,
  copyright?: Copyright,
  link?: Link,
  time?: string,
  keywords?: string,
  bounds?: Bounds,
}

export declare interface Options{
  creator ?: string,
  version ?: string,
  metadata ?: MetaData,
}

/**
 * Interpreting GeoJSON into GPX is lossy
 * It can not be interpreted back into the exact same GeoJSON
 * However, it is still a useful format for many people
 * and is popular with trail runners, race coordinators, and more
 * @param geoJson Feature | FeatureCollection
 * @param options Options
 * @returns XMLDocument
 * @see http://www.topografix.com/GPX/1/1/
 */
export default function GeoJsonToGpx(geoJson: Feature | FeatureCollection, options?: Options): XMLDocument {
  // Create root XMLDocument
  const doc = document.implementation.createDocument('http://www.topografix.com/GPX/1/1', '');
  const instruct = doc.createProcessingInstruction('xml', 'version="1.0" encoding="UTF-8"');
  doc.appendChild(instruct);

  // Set up default options
  const defaultPackageName = '@dwayneparton/geojson-to-gpx';
  const creator = options?.creator || defaultPackageName;

  const createElementWithNS = (tagName: string): Element => {
    return doc.createElementNS('http://www.topografix.com/GPX/1/1', tagName);
  };

  // Set up base GPX Element
  // This holds all the data that makes a GPX file
  const gpx = createElementWithNS('gpx');
  gpx.setAttribute('version', '1.1');
  gpx.setAttribute('creator', creator);

  // Order matters so new wpt and trk should be added to here
  // and appended in order at end
  const wpts: Element[] = [];
  const trks: Element[] = [];

  /**
   * Creates a new tag with content and appends it to the parent
   */
  function createTagInParentElement(parent: Element, tagName: string, content: string | number | undefined) {
    if (content === undefined) {
      return;
    }
    const element = createElementWithNS(tagName);
    const contentEl = doc.createTextNode(String(content));
    element.appendChild(contentEl);
    parent.appendChild(element);
  }

  /**
   * Takes supported properties, creates node, and appends to parent.
   */
  function addSupportedPropertiesFromObject(el: Element, supports: string[], properties?: GeoJsonProperties){
    if (properties && typeof properties === 'object') {
      supports.forEach((key) => {
        const value = properties[key];
        if (value && typeof value === 'string' && supports.includes(key)) {
          createTagInParentElement(el, key, value);
        }
      });
    }
  }

  /**
   * Creates a link element
   * @see http://www.topografix.com/GPX/1/1/#type_linkType
   */
  function createLinkInParentElement(parent: Element, props: Link){
    const {href} = props;
    if(!href){
      return;
    }
    const el = createElementWithNS('link');
    el.setAttribute('href', href);
    addSupportedPropertiesFromObject(el, ['text','type'], props);
    parent.appendChild(el);
  }

  /**
   * Creates a <trk> from GeoJsonProperties
   * Represents a track - an ordered list of points describing a path.
   * ```xml
   * <trk>
   *     <name>The Rut</name>
   *     <desc>A race in big sky montana</desc>
   *     <src>onX Maps</src>
   *     <type>Race</type>
   * </trk>
   * ```
   * @see http://www.topografix.com/GPX/1/1/#type_trkType
   */
  function createTrk(properties?: GeoJsonProperties): Element {
    const el = createElementWithNS('trk');
    const supports = ['name', 'desc', 'src', 'type'];
    addSupportedPropertiesFromObject(el, supports, properties);
    return el;
  }

  /**
   * wpt and trkpt are compatible elements
   * wpt represents a waypoint, point of interest, or named feature on a map.
   * Creates:
   * ```xml
   * <wpt lat="46.965260" lon="-109.533691">
   *     <ele>3205</ele>
   *     <time>1685828773</time>
   * </wpt>
   * ```
   * @see http://www.topografix.com/GPX/1/1/#type_wptType for wpt
   * @see http://www.topografix.com/GPX/1/1/#type_ptType for trkpt
   */
  function createPt(type: 'wpt' | 'trkpt', position: Position, properties?: GeoJsonProperties): Element {
    const [lon, lat, ele, time] = position;
    const el = createElementWithNS(type);
    el.setAttribute('lat', String(lat));
    el.setAttribute('lon', String(lon));
    createTagInParentElement(el, 'ele', ele);
    createTagInParentElement(el, 'time', time);
    const supports = ['name', 'desc', 'src', 'type'];
    addSupportedPropertiesFromObject(el, supports, properties);
    return el;
  }

  /**
   * Creates a <trkseg /> from an array of points
   * Takes an position array and created a track segment
   * A Track Segment holds a list of Track Points which are logically connected in order.
   * To represent a single GPS track where GPS reception was lost,
   * or the GPS receiver was turned off,
   * start a new Track Segment for each continuous span of track data
   * ```xml
   * <trkseg>
   *     <trkpt lat="46.965260" lon="-109.533691">
   *         <ele>3205</ele>
   *         <time>1685828773</time>
   *     </trkpt>
   * </trkseg>
   * ```
   * @see http://www.topografix.com/GPX/1/1/#type_trksegType
   */
  function createTrkSeg(coordinates: Position[]): Element {
    const el = createElementWithNS('trkseg');
    coordinates.forEach((point) => {
      el.appendChild(createPt('trkpt', point));
    });
    return el;
  }

  /**
   * Interpret a GEOJson Feature
   * We assume GEO JSON is related and interpret as such
   */
  function interpretFeature(feature: Feature) : void {
    const { geometry, properties } = feature;
    const { type } = geometry;
    switch (type) {
      // Unsupported for now
      // Eventually could interpret into a line string
      case 'Polygon':
        break;

      // A Point in interpreted interpreted into a wpt
      case 'Point': {
        wpts.push(createPt('wpt', geometry.coordinates, properties));
        break;
      }

      // MultiPoint is interpreted interpreted into multiple wpts
      case 'MultiPoint': {
        geometry.coordinates.forEach((coord: Position) => {
          wpts.push(createPt('wpt', coord, properties));
        });
        break;
      }

      // LineStrings are interpreted into a trk
      case 'LineString': {
        const lineTrk = createTrk(properties);
        const trkseg = createTrkSeg(geometry.coordinates);
        lineTrk.appendChild(trkseg);
        trks.push(lineTrk);
        break;
      }

      // MultiLineStrings are interpreted into a trk with multiple trksegs
      case 'MultiLineString': {
        const trk = createTrk(properties);
        geometry.coordinates.forEach((pos: Position[]) => {
          const trkseg = createTrkSeg(pos);
          trk.appendChild(trkseg);
        });
        trks.push(trk);
        break;
      }

      // All others are unsupported
      default:
        break;
    }
  }

  /**
   * Add Options Meta Data
   * @see http://www.topografix.com/GPX/1/1/#type_metadataType
   */
  if (options && typeof options.metadata === 'object') {
    const meta = options.metadata;
    const metadata = createElementWithNS('metadata');
    createTagInParentElement(metadata, 'name', meta.name);
    createTagInParentElement(metadata, 'desc', meta.desc);
    if (meta.author && typeof meta.author === 'object') {
      const author = createElementWithNS('author');
      createTagInParentElement(author, 'name', meta.author.name);
      createTagInParentElement(author, 'email', meta.author.email);
      if (meta.author.link && typeof meta.author.link === 'object') {
        createLinkInParentElement(author, meta.author.link);
      }
      metadata.appendChild(author);
    }
    if (typeof meta.copyright === 'object') {
      const copyright = createElementWithNS('copyright');
      if (meta.copyright.author) {
        copyright.setAttribute('author', meta.copyright.author);
      }
      createTagInParentElement(copyright, 'year', meta.copyright.year);
      createTagInParentElement(copyright, 'license', meta.copyright.license);
      metadata.appendChild(copyright);
    }
    if (typeof meta.link === 'object') {
      createLinkInParentElement(metadata, meta.link);
    }
    createTagInParentElement(metadata, 'time', meta.time);
    createTagInParentElement(metadata, 'keywords', meta.keywords);
    gpx.appendChild(metadata);
  }

  // Process GeoJSON
  const { type } = geoJson;
  switch (type) {
    case 'Feature': {
      interpretFeature(geoJson);
      break;
    }

    case 'FeatureCollection': {
      const { features } = geoJson;
      features.forEach((feature: Feature) => {
        interpretFeature(feature);
      });
      break;
    }

    default:
      break;
  }

  // Order matters for valid GPX
  // wpt comes before trks
  wpts.forEach((wpt) => gpx.appendChild(wpt));
  trks.forEach((trk) => gpx.appendChild(trk));

  // Append GPX to DOC
  doc.appendChild(gpx);

  return doc;
}
