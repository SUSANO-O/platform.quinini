/** Ilustraciones CSS para cada paso del onboarding (sin assets externos). */
export function HowStepMock({ variant }: { variant: 1 | 2 | 3 | 4 | 5 }) {
  switch (variant) {
    case 1:
      return (
        <div className="how-step-mock how-step-mock--account" aria-hidden>
          <div className="how-step-mock__device how-step-mock__device--laptop">
            <div className="how-step-mock__screen">
              <div className="how-step-mock__bar" />
              <div className="how-step-mock__field" />
              <div className="how-step-mock__field" />
              <div className="how-step-mock__btn" />
            </div>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="how-step-mock how-step-mock--train" aria-hidden>
          <div className="how-step-mock__device how-step-mock__device--monitor">
            <div className="how-step-mock__screen">
              <div className="how-step-mock__charts">
                <span className="how-step-mock__chart how-step-mock__chart--a" />
                <span className="how-step-mock__chart how-step-mock__chart--b" />
                <span className="how-step-mock__chart how-step-mock__chart--c" />
              </div>
              <div className="how-step-mock__lines">
                <span /><span /><span />
              </div>
            </div>
          </div>
        </div>
      );
    case 3:
      return (
        <div className="how-step-mock how-step-mock--widget" aria-hidden>
          <div className="how-step-mock__device how-step-mock__device--tablet">
            <div className="how-step-mock__screen">
              <div className="how-step-mock__palette">
                <span /><span /><span /><span />
              </div>
              <div className="how-step-mock__bubble" />
              <div className="how-step-mock__fab" />
            </div>
          </div>
        </div>
      );
    case 4:
      return (
        <div className="how-step-mock how-step-mock--snippet" aria-hidden>
          <div className="how-step-mock__device how-step-mock__device--laptop">
            <div className="how-step-mock__screen how-step-mock__screen--code">
              <div className="how-step-mock__code-line how-step-mock__code-line--tag" />
              <div className="how-step-mock__code-line" />
              <div className="how-step-mock__code-line how-step-mock__code-line--short" />
              <div className="how-step-mock__code-line" />
            </div>
          </div>
        </div>
      );
    case 5:
      return (
        <div className="how-step-mock how-step-mock--scale" aria-hidden>
          <div className="how-step-mock__device how-step-mock__device--monitor">
            <div className="how-step-mock__screen">
              <div className="how-step-mock__growth">
                <span /><span /><span /><span /><span />
              </div>
              <div className="how-step-mock__metric-row">
                <span /><span />
              </div>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}
