module.exports = {
	rssDate: function () {
		return function (input, render) {
			var date = new Date(Date.parse(render(input)));
			var pieces = date.toString().split(' '),
				offsetTime = pieces[5].match(/[-+]\d{4}/),
				offset = (offsetTime) ? offsetTime : pieces[5],
				parts = [
					pieces[0] + ',',
					pieces[2],
					pieces[1],
					pieces[3],
					pieces[4],
					offset
				];

			return parts.join(' ');
		}
	}
};