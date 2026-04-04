import Select from 'react-select';

export function StyledSelect({ options, value, onChange, placeholder, isClearable = false, isSearchable = true }) {
  return (
    <Select
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      isClearable={isClearable}
      isSearchable={isSearchable}
      className="react-select-container"
      classNamePrefix="select"
      theme={(theme) => ({
        ...theme,
        borderRadius: 6,
        colors: {
          ...theme.colors,
          primary: '#d97706',
          primaryHover: '#b45309',
          neutral0: '#1c1917',
          neutral10: '#292524',
          neutral20: '#44403c',
          neutral30: '#57534e',
          neutral40: '#78716c',
          neutral50: '#a8a29e',
          neutral60: '#d6d3d1',
          neutral70: '#e7e5e4',
          neutral80: '#f5f5f4',
          neutral90: '#fafaf9',
          neutral100: '#fff',
          danger: '#ef4444',
          dangerLight: 'rgba(239, 68, 68, 0.15)',
        },
      })}
    />
  );
}
